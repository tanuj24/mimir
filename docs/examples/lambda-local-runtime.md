# Run Lambda locally

Mimir lets you create and invoke Lambda functions against a local AWS-compatible endpoint. The console gives you a function list, create flow, code workflow, configuration tabs, test invocation, versions, aliases, and triggers.

This is useful for developing serverless code without deploying to AWS.

## Start Mimir

```bash
docker run -d --name mimir \
  -p 8080:80 -p 4566:4566 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /tmp/mimir-glue:/tmp/mimir-glue \
  tanujsoni027/mimir-aws:latest
```

Open http://localhost:8080.

## Create a function in the console

1. Open **Lambda** in the sidebar.
2. Choose **Create function**.
3. Pick a runtime such as Node.js or Python.
4. Set the handler, memory, timeout, environment variables, and other configuration.
5. Create the function and open its detail page.

From the detail page, you can:

- edit code
- upload a zip file
- invoke test events
- view logs
- publish versions
- create aliases
- configure environment variables
- add triggers

## Invoke with the AWS CLI

You can also use the AWS CLI against the local endpoint:

```bash
aws --endpoint-url http://localhost:4566 lambda list-functions
```

Invoke a function:

```bash
aws --endpoint-url http://localhost:4566 lambda invoke \
  --function-name hello \
  --payload '{"name":"local"}' \
  response.json
```

## Why this helps

The same local endpoint can be used by your app, tests, and console:

- app code points to `http://localhost:4566`
- tests create and invoke functions locally
- the console shows function state, logs, configuration, aliases, and triggers

That gives you a fast feedback loop for Lambda development without cloud deployments or AWS charges.

