docker build -t lanmower/node-web-app ./
docker stop ns01
docker rm ns01
docker run -d --name ns01 -e "VIRTUAL_HOST=ns01.udns.ga" -e "VIRTUAL_PORT=80" -e "LETSENCRYPT_HOST=ns01.udns.ga" -p 53:53/udp -p 53:53 --restart unless-stopped lanmower/node-web-app
docker stop ns02
docker rm ns02
sudo docker run -d --name ns02 -e "VIRTUAL_HOST=ns02.udns.ga" -e "VIRTUAL_PORT=80" -e "LETSENCRYPT_HOST=ns02.udns.ga" --restart unless-stopped lanmower/node-web-app
