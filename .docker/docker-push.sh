# Build image (if needed)

# Tag image
docker tag ghost:5.116.2-next-r260817 jbcdev99ai/ghost:5.116.2-next-r260817

# Login
docker login -u jbcdev99ai -p 

# Push
docker push jbcdev99ai/ghost:5.116.2-next-r260817
