# effect-aws-api

Glue code to use effectful APIs with AWS ApiGateway and Lambda.

## Open questions / problems:

1. How to handle route not found errors?

2. The mapping between lambda event/native request and native response/lambda response are rough around the edges (e. g. not supporting binary responses).

3. Dependency management (merge HttpLayer into the provided/default runtime).

## Prior art

https://github.com/AMar4enko/effect-http-api-gateway
