FROM node:alpine

ENV APP_HOME=/opt/git-package-manager

COPY lib ${APP_HOME}/lib
COPY package.json ${APP_HOME}
COPY index.js ${APP_HOME}

RUN apk update \
	&& apk --no-cache add git \
	&& rm -rf /var/cache/apk/* \
  && git config --global user.name "rd" \
  && git config --global user.email rd@softleader.com.tw \
  && cd ${APP_HOME} \
  && npm install -g

VOLUME /app 
WORKDIR /app

ENTRYPOINT [ "gpm" ]
