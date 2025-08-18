# Build image (if needed)

# Tag image
docker tag ghost:5.116.2-alpine-next jbcdev99ai/ghost:5.116.2-alpine-next

# Login
docker login -u jbcdev99ai -p 

# Push
docker push jbcdev99ai/ghost:5.116.2-alpine-next