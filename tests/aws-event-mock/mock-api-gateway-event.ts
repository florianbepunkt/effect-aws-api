import apiGatewayTemplate from "./api-gateway-event-template.json" assert { type: "json" };
import type { PartialDeep } from "type-fest";
import type { APIGatewayProxyEvent, Context } from "aws-lambda";

function deepMerge<T>(target: T, source: PartialDeep<T>): T {
  if (typeof target !== "object" || target === null) {
    // If target is not an object, simply return the source value if provided.
    return (source as T) ?? target;
  }

  if (Array.isArray(target)) {
    if (Array.isArray(source)) {
      // Merge arrays: concatenate and remove duplicates if necessary.
      return Array.from(new Set([...target, ...source])) as T;
    }
    return target;
  }

  if (typeof source !== "object" || source === null) {
    return target;
  }

  // Merge each property in source into target.
  const result: any = { ...target };

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      result[key] = deepMerge((target as any)[key], (source as any)[key]);
    }
  }

  return result;
}

export function createApiGatewayEvent(
  body: PartialDeep<APIGatewayProxyEvent> = {},
): APIGatewayProxyEvent {
  return deepMerge<APIGatewayProxyEvent>({ ...apiGatewayTemplate }, body);
}

export function createLambdaContext(body: PartialDeep<Context> = {}): Context {
  return deepMerge<Context>(
    {
      callbackWaitsForEmptyEventLoop: true,
      functionVersion: "$LATEST",
      functionName: "foo-bar-function",
      memoryLimitInMB: "128",
      logGroupName: "/aws/lambda/foo-bar-function-123456abcdef",
      logStreamName: "2021/03/09/[$LATEST]abcdef123456abcdef123456abcdef123456",
      invokedFunctionArn: "arn:aws:lambda:eu-west-1:123456789012:function:foo-bar-function",
      awsRequestId: "c6af9ac6-7b61-11e6-9a41-93e812345678",
      getRemainingTimeInMillis: () => 1234,
      done: () => console.log("Done!"),
      fail: () => console.log("Failed!"),
      succeed: () => console.log("Succeeded!"),
    },
    body,
  );
}
