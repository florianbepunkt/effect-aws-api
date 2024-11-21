import { Construct } from "constructs";
import { HttpApi, type HttpMethod } from "@effect/platform";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as apigw2 from "aws-cdk-lib/aws-apigatewayv2";
import * as lambda from "aws-cdk-lib/aws-lambda";

type AnyHttpApi = HttpApi.HttpApi<any, any, any>;

interface ApiProps<Definition extends AnyHttpApi> {
  apiGateway?: Partial<apigw2.HttpApiProps>;
  definition: Definition;
  handler: lambda.IFunction;
}

/**
 * Creates a HTTP API from a given API definition.
 *
 * The api works as a lambdalith, meaning all resources are served by the same lambda, that
 * implements the given API definition.
 */
export class EffectHttpApi<Definition extends AnyHttpApi> extends Construct {
  /**
   * API gateway
   */
  public readonly api: apigw2.HttpApi;

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

    this.api = this.createApi();
    this.definition = props.definition;
    this.handler = props.handler;
    this.createResources();
  }

  private createApi() {
    const httpApi = new apigw2.HttpApi(this, "api", {
      apiName: `Unnamed HTTP Api`,
      corsPreflight: {
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
          "X-Amz-Security-Token",
        ],
        allowMethods: [
          apigw2.CorsHttpMethod.OPTIONS,
          apigw2.CorsHttpMethod.GET,
          apigw2.CorsHttpMethod.POST,
          apigw2.CorsHttpMethod.PUT,
          apigw2.CorsHttpMethod.PATCH,
          apigw2.CorsHttpMethod.DELETE,
        ],
        allowCredentials: false,
        allowOrigins: ["*"],
      },
      ...(this.props.apiGateway ?? {}),
    });

    return httpApi;
  }

  private createResources() {
    const api = this.api;
    const handler = this.handler;
    const integration = new HttpLambdaIntegration("handler-integration", handler);

    HttpApi.reflect(this.props.definition, {
      onEndpoint({ endpoint }) {
        const method = endpoint.method;
        const path = endpoint.path.replace(/:(\w+)[^/]*/g, "{$1}");

        const toApiGwMethod = (i: HttpMethod.HttpMethod): apigw2.HttpMethod => {
          switch (i) {
            case "GET":
              return apigw2.HttpMethod.GET;
            case "POST":
              return apigw2.HttpMethod.POST;
            case "PUT":
              return apigw2.HttpMethod.PUT;
            case "DELETE":
              return apigw2.HttpMethod.DELETE;
            case "PATCH":
              return apigw2.HttpMethod.PATCH;
            case "HEAD":
              return apigw2.HttpMethod.HEAD;
            case "OPTIONS":
              return apigw2.HttpMethod.OPTIONS;
          }
        };

        api.addRoutes({ integration, path, methods: [toApiGwMethod(method)] });
      },
      onGroup() {},
    });
  }
}
