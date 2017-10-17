# softleader-container-package-manager

cpm is the container package manager for SoftLeader microservices

## Features

- `$ cpm login <token>` - to save GitHub access token for slmpm
- `$ cpm search [repo]` - to serch repository on softleader & softleader-product github, shows branches & tags
- `$ cpm init` - initial `package.yaml` & `.gitignore`
- `$ com install --save <repo ...>` - to clone repo & save to `package.yaml`
- `$ cpm install` - to clone all repo by `package.yaml`
- `$ cpm uninstall --save <repo ...>` - remove the repositories & save to `package.yaml`
