# Docker Hub Profile & Repository Setup

> ⚠️ **Publish only after v2 is merged to main**
> 
> These setup instructions are ready but should not be published to Docker Hub until the v2 branch is merged into main. Once merged, all curl commands will work with the main branch.
>
> v1 releases are not published to Docker Hub — only v2 and beyond will use Docker Hub prebuilt images.

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

**Where to find Topics:**

Option A (Most Common):
1. Go to: https://hub.docker.com/r/tanujsoni027/mimir-aws
2. Look for **"Edit repository"** button (top right, or pencil icon)
3. In the modal, look for **"Topics"** field at the bottom
4. Click it and add topics

Option B (Alternative):
1. Go to: https://hub.docker.com/r/tanujsoni027/mimir-aws/settings
2. Scroll down to find **"Topics"** section
3. If you don't see it, the field might be under **"Repository Links"** section

Option C (If still not visible):
- Topics might be under the repository's main page
- On the repository page, look for a **"Topics"** section on the right side
- Click **"Add topic"** or the edit icon next to it

**Add these topics** (one per line or separated by commas):

Copy and paste these as topics (one at a time, or comma-separated):

```
aws, aws-emulator, serverless, local-development, lambda, dynamodb, 
glue, testing, docker, open-source, development-tools, mocking, 
offline-first, localstack-alternative, docker-compose
```

Or individually:
- aws
- aws-emulator
- serverless
- local-development
- lambda
- dynamodb
- glue
- testing
- docker
- open-source
- development-tools
- mocking
- offline-first
- localstack-alternative
- docker-compose

**Troubleshooting Topics:**
- If you don't see the Topics field anywhere, try accessing the repository page directly and refreshing
- The **"Edit repository"** button is usually in the top-right corner of the repository page
- If topics are not available in your region, they may appear under **"Repository details"** instead

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

One command to get started:
curl -s https://raw.githubusercontent.com/tanuj24/mimir/v2/docker-compose.yml | docker compose -f - up -d

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

- [ ] v2 branch is merged to main (prerequisite)
- [ ] Profile bio updated (name, bio, website)
- [ ] Repository short description updated
- [ ] Full description (README) pasted
- [ ] Homepage/docs/source links added (optional for users)
- [ ] Topics added (15+ tags)
- [ ] Individual tag descriptions added (optional but helpful)
- [ ] Verify multi-arch displays correctly
- [ ] Images are built and pushed to Docker Hub
- [ ] Verify curl command works: `curl -s https://raw.githubusercontent.com/tanuj24/mimir/main/docker-compose.yml | docker compose -f - up -d`
- [ ] Share on GitHub, Twitter, or community boards

Done! Your Docker Hub profile is now fully optimized for discoverability.
