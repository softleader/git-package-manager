# softleader-container-manager

slcm is the container manager for SoftLeader microservices

## Features

- `$ slcm login <token>` - to save GitHub access token for slmpm
- `$ slcm search [repo]` - to serch repository on softleader & softleader-product github, shows branches & tags
- `$ slcm init` - initial `package.yaml` & `.gitignore`
- `$ slcm install --save <repo ...>` - to clone repo & save to `package.yaml`
- `$ slcm install` - to clone all repo by `package.yaml`
- `$ slcm uninstall --save <repo ...>` - remove the repositories & save to `package.yaml`
