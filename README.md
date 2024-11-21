# effect-aws-api

Glue code to use effectful APIs with AWS ApiGateway and Lambda.

## Open questions / problems:

1. How to apply server middleware? Necessary to enforce global authentication.

2. How to handle route not found errors?

3. The mapping between lambda event/native request and native response/lambda response are rough around the edges (e. g. not supporting binary responses).

4. Dependency management (merge HttpLayer into the provided/default runtime).
