docker rm --force lc
docker build --tag lc .
docker run --publish 3000:3000 --detach --name lc --env-file ./.env lc:latest
