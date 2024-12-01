import { Context, Effect, identity, Layer, pipe, Runtime } from "effect";
import {
  HttpApi,
  HttpApiBuilder,
  HttpMiddleware,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
} from "@effect/platform";
import { Handler, fromLayer } from "@effect-aws/lambda";
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
  Context as LambdaContext,
} from "aws-lambda";

export class RawLambdaInput extends Context.Tag("@effect-aws/api-lambda/raw-input")<
  RawLambdaInput,
  { context: LambdaContext; event: APIGatewayProxyEventV2WithJWTAuthorizer }
>() {}

export const makeApiLambdaWithMiddleware = (middleware?: HttpMiddleware.HttpMiddleware) => {
  function makeApiLambda<E>(
    apiLayer: Layer.Layer<HttpApi.Api, E, never | RawLambdaInput>,
  ): Handler<APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2>;
  function makeApiLambda<R, E1, E2>(
    apiLayer: Layer.Layer<HttpApi.Api, E1, R>,
    globalLayer: Layer.Layer<Exclude<R, RawLambdaInput>, E2>,
  ): Handler<APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2>;
  function makeApiLambda<R, E1, E2>(
    apiLayer: Layer.Layer<HttpApi.Api, E1, R>,
    globalLayer?: Layer.Layer<Exclude<R, RawLambdaInput>, E2>,
  ): Handler<APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2> {
    const app = HttpApiBuilder.httpApp.pipe(
      Effect.flatten,
      middleware ?? identity,
      Effect.tapErrorCause(Effect.logError),
      Effect.catchAllCause((cause) => HttpServerResponse.text(cause.toString(), { status: 500 })),
    );

    // dependencies
    const HttpLayer = HttpServer.layerContext.pipe(
      Layer.merge(HttpApiBuilder.Router.Live),
      Layer.merge(HttpApiBuilder.Middleware.layer),
    );

    // TODO: I would like to merge HttpLayer into the given runtime and/or default runtime, but compiler errors, no idea why
    const globalRuntime = globalLayer
      ? fromLayer(globalLayer)
      : Promise.resolve(Runtime.defaultRuntime as Runtime.Runtime<R>);

    return async (event: APIGatewayProxyEventV2WithJWTAuthorizer, context: LambdaContext) => {
      const runPromise = Runtime.runPromise(await globalRuntime);
      const request = pipe(event, httpEventToNativeRequest, HttpServerRequest.fromWeb);

      return app.pipe(
        Effect.provide([apiLayer, HttpLayer]), // TODO: See above, move HttpLayer to layer/runtime

        Effect.provideService(HttpServerRequest.HttpServerRequest, request),
        Effect.provideService(RawLambdaInput, { context, event }),
        Effect.map((response) => HttpServerResponse.toWeb(response)),
        Effect.flatMap((response) => Effect.promise(() => fromNativeResponse(response))),
        runPromise,
      );
    };
  }

  return makeApiLambda;
};

export const makeApiLambda = makeApiLambdaWithMiddleware();

const httpEventToNativeRequest = (event: APIGatewayProxyEventV2WithJWTAuthorizer): Request => {
  const { rawPath, rawQueryString, headers, requestContext, body } = event;

  // Construct the full URL
  const protocol = headers["x-forwarded-proto"] || "https";
  const host = headers["host"] || "localhost";
  const url = `${protocol}://${host}${rawPath}${rawQueryString ? "?" + rawQueryString : ""}`;

  // Headers initialization
  const requestHeaders = new Headers();
  Object.entries(headers || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      requestHeaders.append(key, value);
    }
  });

  // Create the native Request object
  return new Request(url, {
    method: requestContext.http.method,
    headers: requestHeaders,
    body: body || null, // Set the body if present, else null
  });
};

const fromNativeResponse = async (response: Response): Promise<APIGatewayProxyResultV2> => {
  const headers: { [header: string]: string } = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const body = await response.text();

  return {
    statusCode: response.status,
    headers,
    body: body || "",
    isBase64Encoded: false, // Assume the body is not Base64 encoded by default
  };
};
