# Docker Hub Profile & Repository Setup

## Step 1: Update Your Profile Bio

Go to: https://hub.docker.com/settings/profile

**Full Name:**
```
Tanuj Soni — Mimir Cloud
```

**Bio:**
```
Building Mimir — a free, local AWS emulator for developers. 
Real runtimes (Lambda, Glue), 20+ services, console UI.
No internet, no AWS account needed. Pull and run instantly.
```

**Location:** (optional, your choice)

**Company:** (optional)

**Website:** (optional)
```
https://github.com/tanuj24/mimir
```

---

## Step 2: Update the `mimir-aws` Repository

Go to: https://hub.docker.com/r/tanujsoni027/mimir-aws/settings

### Repository Details

**Short Description (max 100 chars):**
```
Local AWS emulator — run Lambda, Glue, DynamoDB, S3, EC2, and 20+ services locally. Real runtimes, free.
```

**Full Description:**
Open a text editor, copy the contents of `/Users/tanuj/github/mimir/DOCKER_HUB_README.md` and paste it into the **Description** field on Docker Hub. (The long markdown file we just created.)

### Repository Links (Optional)

Leave these blank or link to your own documentation site. Users don't need these — they can start immediately with the README.

*Optional:*
- **Homepage:** Your website or project landing page
- **Documentation:** Your docs site (if you build one)
- **Source:** https://github.com/tanuj24/mimir (only for developers who want to view/contribute code)

### Public Content

**Read-Only** (automatically managed by Docker Hub):
- You can see the image digest, size, pulls, stars here

---

## Step 3: Add Repository Topics (Tags for Discoverability)

Scroll down to **Topics** section. Add these topics (click each and hit Enter):

```
aws
aws-emulator
serverless
local-development
lambda
dynamodb
glue
testing
docker
open-source
development-tools
mocking
offline-first
localstack-alternative
docker-compose
```

---

## Step 4: Update Image Descriptions (Individual Tags)

For each tag (`backend`, `backend-v2`, `server`, `server-v2`, `web`, `web-v2`), you can add a description. Go to the **Tags** tab.

**For `backend` and `backend-v2`:**
```
AWS service emulator. Quarkus-based emulation of 50+ AWS services (Lambda on Firecracker, RDS, DynamoDB, S3, etc.). Runs as a Docker container on port 4566.
```

**For `server` and `server-v2`:**
```
Node.js/Express API proxy + Glue job execution engine. Routes AWS SDK requests to the backend; runs Glue jobs and notebooks locally in Docker.
```

**For `web` and `web-v2`:**
```
React + Vite console UI. Interactive AWS-style dashboard for managing resources. Serves on port 8080. No CLI needed.
```

---

## Step 5: Verify Multi-Arch Display

On the **Tags** page, you should see a **Supported architectures** indicator showing both `linux/amd64` and `linux/arm64` for each tag. If not visible, it will auto-update as Docker Hub indexes the manifest.

---

## Step 6: Optional — Add a Custom Docker Hub Organization (If Desired)

If you want all three images under a cleaner namespace (e.g., `mimir/aws` instead of `tanujsoni027/mimir-aws`), create an organization:

1. Go to: https://hub.docker.com/organizations/create
2. Organization name: `mimir` (if available)
3. Create repositories: `mimir/backend`, `mimir/server`, `mimir/web`
4. Rebuild/push images to the new org

But `tanujsoni027/mimir-aws` is fine and already published — no need to change if you don't want to.

---

## Step 7: Promote via Social

Once Docker Hub is updated, announce it:

**Example Tweet/LinkedIn Post:**
```
🎉 Mimir v2 is live on Docker Hub!

Run 20+ AWS services locally — Lambda, Glue, DynamoDB, S3, EC2, and more.
Real runtimes, real code, completely free.

Just pull & run:
docker pull tanujsoni027/mimir-aws:backend

No building. No config. Works offline.
Open http://localhost:8080

Get started: hub.docker.com/r/tanujsoni027/mimir-aws
```

**For developers who want to contribute:**
- Link to GitHub for source code: github.com/tanuj24/mimir
- Link to GitHub issues/discussions for feedback

**For end-users:**
- Only link to Docker Hub and this README
- No GitHub needed

---

## SEO Keywords in Docker Hub

The above setup includes these search-friendly terms:
- "local AWS emulator"
- "Lambda local"
- "serverless offline"
- "DynamoDB emulator"
- "Glue local"
- "LocalStack alternative"
- "free AWS"
- "Docker AWS"

Docker Hub's search will pick these up from:
1. Short description
2. Full description (README)
3. Topics/tags
4. Repository name
5. Profile bio

---

## Checklist

- [ ] Profile bio updated (name, bio, website)
- [ ] Repository short description updated
- [ ] Full description (README) pasted
- [ ] Homepage/docs/source links added
- [ ] Topics added (15+ tags)
- [ ] Individual tag descriptions added (optional but helpful)
- [ ] Verify multi-arch displays correctly
- [ ] Share on GitHub, Twitter, or community boards

Done! Your Docker Hub profile is now fully optimized for discoverability.
