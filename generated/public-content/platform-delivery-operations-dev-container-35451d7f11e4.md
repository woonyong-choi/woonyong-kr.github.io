---
layout: default
title: Dev Container
nav_order: 8
permalink: /wiki/platform-delivery-operations-dev-container-35451d7f11e4/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/platform-delivery-operations-dev-container-35451d7f11e4
projection_sha256: 6f1081e07061d966a898053a4693f1db79769ad312cfb1396dc63152d51c2a3e
parent: 개발 환경
content_status: ready
public_parent_id: Wiki/keywords/platform-delivery-operations-topic-eb212956fe45
grand_parent: DevOps
---

# Dev Container
{: .no_toc }

F5로 C 프로그램을 실행할 때는 VS Code가 어느 환경에서 어떤 compiler를 호출하는지 알아야 한다. Dev Container는 프로젝트에 필요한 도구와 실행 환경을 컨테이너 안에 준비하고 VS Code를 그 환경에 연결한다. 로컬 폴더를 컨테이너에서 여는 흐름에서는 `devcontainer.json`이 생성·연결 방법을 지정하고, 연결된 창의 터미널과 개발 도구가 컨테이너 환경을 사용한다. 설정 파일이 있다는 사실과 현재 창이 실제로 연결됐다는 사실은 별도로 확인해야 한다. [VS Code Dev Containers](https://code.visualstudio.com/docs/devcontainers/containers)

## 이미지를 만드는 단계와 C를 컴파일하는 단계

Week 6 자료구조 프로젝트의 `.devcontainer/Dockerfile`은 Ubuntu에 GCC·GDB·Python 등 개발 도구를 설치한다. 이 파일에는 과제의 C 소스를 컴파일하는 명령이 없다. 따라서 여기서 이미지 빌드는 도구를 준비하는 단계이고, 프로그램 빌드는 준비된 GCC가 선택한 C 소스를 실행 파일로 바꾸는 단계다. C 코드를 고칠 때마다 도구 설치 이미지부터 다시 만들도록 연결된 구조가 아니다. [프로젝트 Dockerfile](https://github.com/woonyong-kr/SW-AI-W06-data_structures_docker/blob/70284b20008dfe697de84431bedff6f059dc33c0/.devcontainer/Dockerfile)

## F5에서 실행 파일까지

저장소의 `70284b2` 커밋에 있는 `Debug C Program` 설정으로 F5를 누르면 `launch.json`의 `preLaunchTask`가 `C: Build Active File (Debug)`라는 task를 선택한다. 확인한 로컬 `tasks.json`의 이 task는 활성 파일의 상대 경로를 `scripts/build_c.py`에 넘기고, 스크립트는 `gcc -g -O0`로 빌드해 `bin/debug/<부모 폴더명>/<파일명>`에 실행 파일을 만든다. 이후 디버거가 `program`에 지정된 같은 경로를 실행한다. 컨테이너에 연결된 창에서 이 설정을 사용해야 이 도구 경로를 컨테이너 기준으로 읽을 수 있다. [Debug 설정](https://github.com/woonyong-kr/SW-AI-W06-data_structures_docker/blob/70284b20008dfe697de84431bedff6f059dc33c0/.vscode/launch.json), [컴파일 스크립트](https://github.com/woonyong-kr/SW-AI-W06-data_structures_docker/blob/70284b20008dfe697de84431bedff6f059dc33c0/scripts/build_c.py)

해당 커밋에는 `launch.json`과 빌드 스크립트가 있지만 `tasks.json`은 포함돼 있지 않다. 따라서 저장소를 새로 내려받았을 때는 task 정의도 준비해야 한다. 위 Debug 경로를 연결하는 최소 `.vscode/tasks.json`은 다음과 같다.

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "C: Build Active File (Debug)",
      "type": "shell",
      "command": "python3",
      "args": [
        "${workspaceFolder}/scripts/build_c.py",
        "${relativeFile}",
        "--config",
        "debug"
      ],
      "group": {
        "kind": "build",
        "isDefault": false
      },
      "problemMatcher": [
        "$gcc"
      ]
    }
  ]
}
```

이 JSON은 VS Code에 빌드 task를 등록하는 설정이다. 컨테이너에 실제로 연결하고 GCC·Python·GDB를 사용할 수 있는 상태에서 Debug 설정을 실행해야 전체 경로가 이어진다.

기본 빌드 메뉴와 F5가 반드시 같은 task를 고르는 것은 아니다. 확인한 로컬 설정의 `isDefault: true`는 별도의 `aarch64-linux-gnu-gcc` task에 붙어 있고, F5는 이름으로 지정된 Python/GCC task를 사용한다. 같은 로컬 파일에는 `--config release`로 `bin/release/`에 빌드하는 task도 따로 있다. 빌드 문제를 찾을 때는 누른 버튼에서 task 이름, 실제 compiler, 출력 경로까지 따라가야 한다. 또한 `ubuntu:latest`는 고정된 Ubuntu 버전을 뜻하지 않는다. 재현 환경을 설명할 때는 실제 이미지와 아키텍처를 확인해 기록해야 한다. [디버깅 설정과 preLaunchTask](https://code.visualstudio.com/docs/debugtest/debugging-configuration)
