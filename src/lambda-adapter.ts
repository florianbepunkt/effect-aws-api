import { Context, Effect, Layer, pipe, Runtime } from "effect";
import {
  HttpApi,
  HttpApiBuilder,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
} from "@effect/platform";
import { Handler, fromLayer } from "@effect-aws/lambda";
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  APIGatewayProxyHandler,
  Context as LambdaContext,
} from "aws-lambda";

export class RawLambdaInput extends Context.Tag("@effect-aws/api-lambda/raw-input")<
  RawLambdaInput,
  { context: LambdaContext; event: APIGatewayProxyEvent }
>() {}

export function makeApiLambda<E>(
  apiLayer: Layer.Layer<HttpApi.Api, E, never | RawLambdaInput>,
): Handler<APIGatewayProxyEvent, APIGatewayProxyResult>;
export function makeApiLambda<R, E1, E2>(
  apiLayer: Layer.Layer<HttpApi.Api, E1, R>,
  globalLayer: Layer.Layer<Exclude<R, RawLambdaInput>, E2>,
): Handler<APIGatewayProxyEvent, APIGatewayProxyResult>;
export function makeApiLambda<R, E1, E2>(
  apiLayer: Layer.Layer<HttpApi.Api, E1, R>,
  globalLayer?: Layer.Layer<Exclude<R, RawLambdaInput>, E2>,
): APIGatewayProxyHandler {
  /**
   * NOTE: You could apply "server-wide" middleware here. If this is the middleware:
   *
   * const MyLogger = HttpMiddleware.make((app) =>
   *   Effect.gen(function* () {
   *   console.log("LOGGED")
   *   return yield* app
   *   })
   * )
   *
   * It can be applied like this:
   *
   * const app = HttpApiBuilder.httpApp.pipe(Effect.flatten, MyLogger);
   *
   */
  const app = HttpApiBuilder.httpApp.pipe(Effect.flatten);

  // dependencies
  const HttpLayer = HttpServer.layerContext.pipe(Layer.merge(HttpApiBuilder.Router.Live));

  // TODO: I would like to merge HttpLayer into the given runtime and/or default runtime, but compiler errors, no idea why
  const globalRuntime = globalLayer
    ? fromLayer(globalLayer)
    : Promise.resolve(Runtime.defaultRuntime as Runtime.Runtime<R>);

  return async (event, context) => {
    const runPromise = Runtime.runPromise(await globalRuntime);
    const request = pipe(event, eventToNativeRequest, HttpServerRequest.fromWeb);

    return app.pipe(
      Effect.provide([apiLayer, HttpLayer]), // TODO: See above, move HttpLayer to layer/runtime
      Effect.provideService(HttpServerRequest.HttpServerRequest, request),
      Effect.provideService(RawLambdaInput, { context, event }),
      Effect.map(HttpServerResponse.toWeb),
      Effect.flatMap((response) => Effect.promise(() => fromNativeResponse(response))),
      runPromise,
    );
  };
}

const eventToNativeRequest = (event: APIGatewayProxyEvent): Request => {
  const { httpMethod, headers, body, path, queryStringParameters } = event;

  // Construct the URL
  const protocol = headers?.["X-Forwarded-Proto"] || "https";
  const host = headers?.["Host"] || "localhost";
  const queryString = new URLSearchParams(
    (queryStringParameters as Record<string, string>) || {},
  ).toString();
  const url = `${protocol}://${host}${path}${queryString ? `?${queryString}` : ""}`;

  // Map headers to Headers object
  const requestHeaders = new Headers();
  for (const [key, value] of Object.entries(headers || {})) {
    if (value) {
      requestHeaders.append(key, value);
    }
  }

  // Return the Request object
  return new Request(url, {
    method: httpMethod,
    headers: requestHeaders,
    body: body || null,
  });
};

const fromNativeResponse = async (response: Response): Promise<APIGatewayProxyResult> => {
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
