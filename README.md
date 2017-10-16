# softleader-microservice-package-manager

slmpm is the package manager for SoftLeader microservices

## Features

- `$ slmpm login <token>` - to save GitHub access token for slmpm
- `$ slmpm search [repo]` - to serch repository on softleader & softleader-product github, shows branches & tags
- `$ slmpm init` - initial `package.yaml` & `.gitignore`
- `$ slmpm install --save <repo ...>` - to clone repo & save to `package.yaml`
- `$ slmpm install` - to clone all repo by `package.yaml`
- `$ slmpm uninstall --save <repo ...>` - remove the repositories & save to `package.yaml`
