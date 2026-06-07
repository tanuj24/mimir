# Use the EC2 browser terminal

Mimir can launch local EC2-style instances backed by containers. Each running instance can be opened in a browser terminal from the console.

This is useful for testing scripts, instance workflows, and shell-based demos without creating real AWS infrastructure.

## Start Mimir

```bash
docker run -d --name mimir \
  -p 8080:80 -p 4566:4566 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /tmp/mimir-glue:/tmp/mimir-glue \
  tanujsoni027/mimir-aws:latest
```

Open http://localhost:8080.

## Launch an instance

1. Open **EC2** in the sidebar.
2. Choose **Launch instance**.
3. Use the default AMI and instance type, or set a name such as `web-server`.
4. Wait for the instance state to become `running`.

You can also create an instance with the local AWS endpoint:

```bash
aws --endpoint-url http://localhost:4566 ec2 run-instances \
  --image-id ami-12345678 \
  --instance-type t3.micro \
  --min-count 1 \
  --max-count 1
```

## Open the terminal

When the instance is running, click the terminal icon in the EC2 instances table.

The terminal opens a real shell inside the local instance container. Try:

```bash
pwd
uname -a
echo "hello from local EC2"
```

## How it works

Mimir maps each local EC2 instance to a Docker container named:

```text
mimir-ec2-<instance-id>
```

The browser terminal connects to Mimir over WebSocket. Mimir then bridges that session to `docker exec` inside the instance container.

## Cleanup

Terminate the instance from the console, or use:

```bash
aws --endpoint-url http://localhost:4566 ec2 terminate-instances \
  --instance-ids <instance-id>
```

If a stale local instance container remains, remove it manually:

```bash
docker rm -f mimir-ec2-<instance-id>
```

