import { Construct } from "constructs";
import { HttpApi } from "@effect/platform";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";

type AnyHttpApi = HttpApi.HttpApi<any, any, any>;

interface ApiProps<Definition extends AnyHttpApi> {
  apiGateway?: Partial<apigw.RestApiProps>;
  definition: Definition;
  handler: lambda.IFunction;
}

/**
 * Creates a tenant facing REST API from a given API definition.
 *
 * The api works as a lambdalith, meaning all resources are served by the same lambda, that
 * implements the given API definition.
 */
export class TenantFacingRestApi<Definition extends AnyHttpApi> extends Construct {
  /**
   * API gateway
   */
  public readonly api: apigw.IRestApi;

  /**
   * HTTP API definition
   */
  public readonly definition: Definition;

  /**
   * Lambda handler
   */
  public readonly handler: lambda.IFunction;

  constructor(
    scope: Construct,
    id: string,
    private readonly props: ApiProps<Definition>,
  ) {
    super(scope, id);

    this.api = this.createApi(props.apiGateway ?? {}) as apigw.IRestApi;
    this.definition = props.definition;
    this.handler = props.handler;
    this.createResources();
  }

  private createApi(options: Partial<apigw.RestApiProps> = {}) {
    const api = new apigw.RestApi(this, "API", {
      defaultCorsPreflightOptions: {
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
          "X-Amz-Security-Token",
          "client-id",
          "tenant-id",
        ],
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
      },
      deploy: true,
      deployOptions: {
        accessLogFormat: apigw.AccessLogFormat.jsonWithStandardFields(),
        dataTraceEnabled: false,
        loggingLevel: apigw.MethodLoggingLevel.ERROR,
        tracingEnabled: true,
        stageName: "production",
      },
      endpointTypes: [apigw.EndpointType.REGIONAL],
      restApiName: `Unnamed REST API`,
      ...options,
    });

    return api;
  }

  private createResources() {
    const api = this.api;
    const handler = this.handler;

    const integration = new LambdaIntegration(handler, { restApi: api });
    const pathResourceMap: Record<string, apigw.IResource> = { "/": api.root };

    HttpApi.reflect(this.props.definition, {
      onEndpoint({ endpoint }) {
        const method = endpoint.method;
        const path = endpoint.path.replace(/:(\w+)[^/]*/g, "{$1}");
        const segments = path.split("/").filter(Boolean);

        let currentPath = "";
        let ancestorPath = "";

        // Adding resources if they don't exist
        for (let i = 0; i <= segments.length; i++) {
          if (i === 0) {
            currentPath = "/";
            ancestorPath = "";
          } else {
            ancestorPath += (ancestorPath === "/" ? "" : "/") + (i > 1 ? segments[i - 2] : "");
            currentPath += (currentPath === "/" ? "" : "/") + segments[i - 1];
          }

          const resource = segments[i - 1];

          if (!pathResourceMap[currentPath] && !!resource && i !== 0) {
            const ancestor = pathResourceMap[ancestorPath];
            pathResourceMap[currentPath] = ancestor.addResource(resource);
          }
        }

        const resource = pathResourceMap[currentPath];
        resource.addMethod(method, integration);
      },
      onGroup() {},
    });
  }
}

/**
 * Lambda integration that defines a wildcard permission resource policy for a given rest API.
 *
 * When using a lambdalith pattern where one lambda handles a lot of api endpoints (> 30), you will
 * run into an error where the lambda resource policy exccedds the allowed limit, as for each endpoint
 * a resource policy is generated.
 */
class LambdaIntegration extends apigw.LambdaIntegration {
  constructor(
    handler: lambda.IFunction,
    options: apigw.LambdaIntegrationOptions & {
      restApi: apigw.IRestApi;
    },
  ) {
    super(handler, options);

    handler.addPermission("ApiGatewayPermissions", {
      // @ts-ignore
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: options.restApi.arnForExecuteApi(),
    });
  }

  bind(method: apigw.Method): apigw.IntegrationConfig {
    const integrationConfig = super.bind(method);
    const permissions = method.node.children.filter((c) => c instanceof lambda.CfnPermission);
    permissions.forEach((p) => method.node.tryRemoveChild(p.node.id));
    return integrationConfig;
  }
}
