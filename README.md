# repository-package-manager

rpm is the repository package manager for GitHub, inspired by npm & maven

## Install

```
$ npm install softleader/repository-package-manager -g
```

or build from suorce code:

```
$ git clone git@github.com:softleader/repository-package-manager.git
$ cd repository-package-manager
$ npm install -g
```

## Usage

![](./doc/overview.svg)

```
$ rpm --help

  Usage: rpm [options] [command]


  Options:

    -V, --version  output the version number
    -h, --help     output usage information


  Commands:

    remote [options] [owners...]       Save GitHub remote owner & access token
    init                               Interactively create a package.yaml file
    install [options] [repository...]  Install a repository <owner>/<repository>[@tag]
    uninstall <repository...>          Remove a repository <owner>/<repository>
    *

  https://github.com/softleader/repository-package-manager#readme
```
  
### remote

當你要操作 private repository 前, 你必須要加好 remote 及其 access token:

```
$ rpm remote
? owner: softleader
? token: ooo
```

*Access token* 產生方式請參考 [Creating a personal access token for the command line](https://help.github.com/articles/creating-a-personal-access-token-for-the-command-line/), 請確認要給予 ***repo*** 的所有權限

產生好了以後會在 home 產生 *.rpm* 名稱的檔案, 你可以備份此檔已保留加過的 token

> 如果是 public repository 就不需要加入 remote

如果今天是在 pipeline 中或任何無法以互動式的指令加入 token 的情況下, 必須改成執行:

```
$ rpm remote --token ooo softleader softleader-project
```

### init

以互動式的指令產生 `package.yaml`

```
$ rpm init
? name: my-project
? version: 1.0.0
? description: demo
...
```

`package.yaml` 中的格式為:

```yaml
name: my-project
version: 1.0.0
description: demo
dependencies:
  - {owner}/{repository}: {tag}
  - {owner}/{repository}: {tag}
filtering:
  - TAG: ${tag}
```

我們使用跟 npm 相同的 [node-semver](https://github.com/npm/node-semver) library 做 *{tag}*  的 parsing, 因此你可以:

- 指定切確 tag: `v1.0.7`
- 指定 range: `v1.0.x` := `>=v1.0.0 <v1.1.0`
- 自定義 range: `>=v1.0.0 <v1.1.7`

當指定 range 時, 我們會試著找到符合的 tags 中最後的一版作為 install 的目標

> 建議研讀 [node-semver#readme](https://github.com/npm/node-semver#readme) 了解更多的控制

### install

```
rpm install --help

  Usage: install [options] [repository...]

  Install a repository <owner>/<repository>[@tag]


  Options:

    -c, --contents <path>     specify the contents of a file to retrieve in each repository
    -F, --filtering           activete content filtering, only applies to contents of specifying files
    -y, --yaml-file <path>    path to a YAML file, default 'package.yaml'
    -d, --install-dir <path>  path to directory to install, default 'repositories'
    -h, --help                output usage information
```

安裝指定 repository 及其版本

```
$ rpm install <owner>/<repository>[@tag]
```

會將指定 repository 的 clone 到 *repositories/* 下, 並 checkout 到指定 tag, 也會在 `package.yaml` 中加上該 dependencies 資訊, 目錄結構將呈現: 

```
.
├── package.yaml
└── repositories
    └── my-project
        ├── Containerfile
        ├── pom.xml
        └── ...
```

如果 install 後面沒有接任何 repository, 會將 `package.yaml` 中所有的 repository 都 clone 到 *repositories/* 下

```
$ rpm install
```

####  -c, --contents \<path>

指定檔案內容, 以大幅的加速 install 時間 (預設模式是 clone 出完整的 repository 內容)

```
$ rpm install -c Containerfile -c docs/asciidoc/template.adoc ...
```

執行後就只會有指定的檔案內容

```
.
├── package.yaml
└── repositories
    └── my-project
        ├── Containerfile
        └── docs
            └── asciidoc
                └── template.adoc
```

#### -F, --filtering

在 `package.yaml` 中定義在 filtering 區塊的變數, 會在 [install 指定檔案內容](#-c---contents-path) 時 **(不會作用在完整 clone)**, 自動的取代檔案的內容

```yaml
# package.yaml

...
dependencies:
  - owner/my-project: v1.0.0
filtering:
  - TAG: ${tag}
  - name: Matt
```

在檔案的內容中, 使用 `${...}` 來宣告變數, 例如在 repository 的根目錄下有 `hello.txt`:

```
Hello ${name} @ @TAG@
```

接著執行:

```
$ rpm install -F -c hello.txt
```

則 `hello.txt` 將會被 clone 在:

```
.
├── package.yaml
└── repositories
    └── my-project
        └── hello.txt
```

且內容將轉變為:

```
Hello Matt @ v1.0.0
```

另外我們已經也預設提供了下述變數:

- `${owner}` - repository onwer
- `${repo}` - repository name
- `${tag}` - repository tag

#### -y, --yaml-file \<path>

指定要讀取的 YAML 檔案位置, 預設: `package.yaml`

#### -d, --install-dir \<path>

指定安裝的目錄, 預設: `repositories`

### uninstall

移除已安裝的 repository 及其 `package.yaml` 中的資訊

```
$ rpm uninstall <owner>/<repository>
```

> 如果安裝時, 有下 `--yaml-file` 或 `--install-dir` 等參數, 在反安裝時也要記得給參數
