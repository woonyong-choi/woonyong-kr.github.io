---
layout: default
title: 가상 네트워크
nav_order: 5
permalink: /wiki/platform-delivery-operations-topic-82e47b673856/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/platform-delivery-operations-topic-82e47b673856
projection_sha256: b9ae0cc061c02bfe6ba8723cf6d023f4453e281f0bcc10eabd23ec64658b1ce9
parent: 클라우드
content_status: ready
public_parent_id: Wiki/platform-delivery-operations/cloud
grand_parent: DevOps
---

# 가상 네트워크
{: .no_toc }

가상 네트워크는 클라우드 리소스가 사용할 주소 범위와 통신 경로를 정하는 공간이다. AWS에서는 VPC 안에 Subnet을 만들고 EC2, ALB, RDS를 배치한다. EC2를 생성할 때 Subnet을 고르는 일은 주소를 배정하는 동시에, 그 서버가 어떤 경로로 다른 리소스와 통신할지 정하는 일이기도 하다.

외부 요청을 받는 ALB와 데이터를 보관하는 RDS를 같은 방식으로 공개할 필요는 없다. 아래에서는 `10.0.0.0/16` VPC를 예로 들어 주소를 나누고, 웹 요청이 들어오는 경로와 서버가 업데이트를 받으러 나가는 경로를 구분한다. AWS 리소스 생성은 계정에서 수행하는 절차이며, 페이지의 Python 예제는 CIDR 관계만 계산한다.

## Public과 Private을 가르는 경로

Subnet 이름에 `public`을 붙였다고 인터넷에 연결되는 것은 아니다. 연결된 Route Table에 Internet Gateway로 향하는 경로가 있어야 Public Subnet이다. 다음 표는 IPv4 인터넷 전체를 대상으로 하는 기본 경로의 예다.

| Subnet 구성 | 목적지 | 다음 경로 |
| --- | --- | --- |
| Public | `0.0.0.0/0` | VPC에 연결한 Internet Gateway |
| 외부 접속이 필요한 Private | `0.0.0.0/0` | NAT Gateway |
| 인터넷 접속이 필요 없는 Private | 인터넷 기본 경로 없음 | 필요한 내부 경로만 사용 |

Public Subnet의 EC2가 Internet Gateway를 통해 IPv4 인터넷과 직접 통신하려면 Public IPv4 또는 Elastic IP도 필요하다. Route Table만 맞고 주소나 보안 규칙이 맞지 않으면 통신하지 못한다. 반대로 Public IP를 배정했더라도 Internet Gateway 경로가 없는 Subnet을 Public으로 만들지는 못한다. [AWS Internet Gateway 문서](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html)

웹 요청과 패키지 다운로드는 서로 다른 연결이다. 다음 흐름에서 ALB는 클라이언트 요청을 받아 Private Subnet의 서버로 전달하고, NAT Gateway는 서버가 먼저 시작한 외부 연결을 중계한다.

```text
웹 요청
  인터넷 클라이언트 → Internet Gateway → Public Subnet의 ALB
  ALB → Private Subnet의 EC2 웹 서버 → Private Subnet의 RDS

서버의 패키지 다운로드
  Private Subnet의 EC2 → Public Subnet의 NAT Gateway
  NAT Gateway → Internet Gateway → 외부 패키지 저장소
```

두 번째 흐름은 Public 방식의 Zonal NAT Gateway를 사용하는 예다. NAT를 통해 응답을 돌려받을 수 있지만, 인터넷 클라이언트가 NAT를 거슬러 올라가 Private EC2에 새 연결을 시작할 수는 없다. 관리용 Bastion을 사용하는 구성이라면 Bastion을 Public Subnet에 두고 필요한 관리 접속만 허용할 수 있다. Bastion은 이 웹 요청 경로에 반드시 들어가는 구성 요소는 아니다.

## 두 AZ에 주소 나누기

VPC의 Name 태그는 `VPC-Lab`, IPv4 CIDR은 `10.0.0.0/16`으로 둔다. DNS resolution과 DNS hostnames를 활성화하고, 서울 리전의 `ap-northeast-2a`와 `ap-northeast-2c`에 Subnet을 나눈다. AZ는 한 리전 안에서 리소스를 분산 배치하는 경계다.

| Subnet | AZ | CIDR | 배치 예 |
| --- | --- | --- | --- |
| public 2a | `ap-northeast-2a` | `10.0.10.0/24` | ALB, Zonal NAT Gateway |
| public 2c | `ap-northeast-2c` | `10.0.20.0/24` | ALB |
| private 2a | `ap-northeast-2a` | `10.0.100.0/24` | Auto Scaling EC2 |
| private 2c | `ap-northeast-2c` | `10.0.200.0/24` | Auto Scaling EC2, RDS Reader 배치 후보 |

ALB는 두 Public Subnet을 사용하고, Auto Scaling Group은 두 Private Subnet에 EC2를 배치하도록 구성할 수 있다. RDS는 두 AZ의 Private Subnet으로 DB Subnet Group을 구성한 뒤 실제 DB 인스턴스의 배치를 정한다. 표의 Reader 위치는 한 가지 배치 예이며, Subnet 네 개를 만들었다고 ALB·EC2·DB의 가용성 설정까지 자동으로 완성되지는 않는다.

CIDR 숫자를 외우는 대신 두 조건을 확인하면 된다. 모든 Subnet이 VPC 주소 범위 안에 있어야 하고, Subnet끼리 주소가 겹치면 안 된다. 다음 코드는 Python 표준 라이브러리 `ipaddress`로 두 조건을 확인한다.

```run-python
from ipaddress import ip_network
from itertools import combinations

vpc = ip_network("10.0.0.0/16")
subnets = {
    "public 2a": ip_network("10.0.10.0/24"),
    "public 2c": ip_network("10.0.20.0/24"),
    "private 2a": ip_network("10.0.100.0/24"),
    "private 2c": ip_network("10.0.200.0/24"),
}

for name, subnet in subnets.items():
    print(f"{name}: {subnet}, VPC 내부={subnet.subnet_of(vpc)}")

overlaps = [
    f"{left_name} / {right_name}"
    for (left_name, left), (right_name, right) in combinations(subnets.items(), 2)
    if left.overlaps(right)
]
print("겹치는 Subnet:", ", ".join(overlaps) if overlaps else "없음")
```

처음 실행하면 네 Subnet 모두 `VPC 내부=True`, 마지막 줄은 `겹치는 Subnet: 없음`이다. `private 2c`의 CIDR을 `10.0.10.0/24`로 바꾸면 VPC 안에 있다는 조건은 여전히 만족하지만 `public 2a / private 2c`가 겹친다고 나온다. 이 계산은 AWS 연결 상태나 실제 리소스 존재 여부를 확인하는 검사가 아니다.

## Gateway를 만들고 Subnet에 경로 연결하기

VPC 생성 화면에서 **VPC only**를 선택해 주소 범위를 정하고, 앞의 표대로 Subnet 네 개를 만든다. 마법사에서 연결 리소스까지 함께 만드는 방식을 사용했다면 자동 생성된 Route Table과 Gateway를 먼저 확인한다. 같은 역할의 리소스를 다시 만들 필요는 없다.

Internet Gateway는 생성한 뒤 `VPC-Lab`에 연결한다. Public Route Table에는 `0.0.0.0/0 → igw-...`를 추가하고, **Subnet associations**에 Public Subnet 두 개를 연결한다. Route Table에 경로를 쓰는 것과 Subnet이 그 Route Table을 사용하는 것은 별개의 설정이다.

이 예제에서는 `public 2a`에 Public 방식의 Zonal NAT Gateway를 만들고 Elastic IP를 연결한다. 상태가 `Available`이 되면 Private Route Table에 `0.0.0.0/0 → nat-...`를 추가하고 Private Subnet 두 개를 연결한다. NAT가 놓인 Public Subnet에도 Internet Gateway 경로가 있어야 외부까지 이어진다.

| Route Table | 기본 경로 | 연결할 Subnet |
| --- | --- | --- |
| Public | `0.0.0.0/0 → igw-...` | public 2a, public 2c |
| Private | `0.0.0.0/0 → nat-...` | private 2a, private 2c |

하나의 Zonal NAT를 두 AZ가 함께 쓰면 `2c` 서버의 인터넷 접속도 NAT가 있는 `2a`에 의존한다. 여러 AZ에 서버를 배치했더라도 이 외부 접속 경로에는 한 AZ의 장애가 함께 영향을 줄 수 있다. AZ별 Zonal NAT와 Route Table을 사용하는 구성에서는 각 Private Subnet을 같은 AZ의 NAT로 연결한다. [AWS NAT Gateway 가용성 설명](https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-basics.html)

현재 AWS에는 **Regional NAT Gateway**도 있다. 자동 모드에서는 워크로드가 있는 AZ에 맞춰 확장하며, 사용자가 NAT를 배치할 Public Subnet을 지정하지 않는다. 따라서 “NAT는 반드시 Public Subnet 하나에 만든다”는 설명은 여기서 선택한 Public Zonal 구성의 조건이다. Regional 모드와 Zonal 모드는 생성 방식과 가용성 구성을 구분해서 읽어야 한다. [AWS Regional NAT Gateway 문서](https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateways-regional.html)

## Security Group과 NACL

Route Table이 다음 목적지를 정한다면, 보안 규칙은 그 통신을 허용할지 정한다. Security Group은 연결된 리소스의 네트워크 인터페이스에 적용되고, NACL은 Subnet 경계에 적용된다.

| 구분 | Security Group | NACL |
| --- | --- | --- |
| 규칙 | 허용 규칙 | 허용·거부 규칙 |
| 적용 범위 | 연결된 리소스의 네트워크 인터페이스 | 연결된 Subnet |
| 연결 상태 | Stateful | Stateless |
| 응답 트래픽 | 허용한 연결의 응답은 자동 허용 | 응답 방향도 별도 규칙 필요 |

예를 들어 ALB의 Security Group은 인터넷에서 오는 HTTP `80`을 허용하고, 웹 서버의 Security Group은 **ALB의 Security Group을 출발지로 지정한 HTTP**만 허용한다. 서버를 Private Subnet에 두면서 ALB를 통한 웹 요청은 받을 수 있는 구성이다.

NACL에서 요청 방향의 포트만 열면 응답이 차단될 수 있다. 요청과 응답의 방향, 각 방향의 목적지 포트를 함께 살펴야 한다. 먼저 Security Group으로 필요한 연결을 정하고, 해당 Subnet에 실제로 연결된 NACL의 Inbound·Outbound 규칙을 확인한다. 기본 NACL이라는 이름만으로 현재 규칙이 열려 있다고 단정하지 않는다. [AWS NACL과 연결 상태 설명](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html)

## 연결되지 않을 때 따라갈 순서

먼저 리전이 서울로 맞춰져 있는지, VPC CIDR이 `10.0.0.0/16`인지 확인한다. Subnet 네 개의 CIDR과 AZ, Route Table의 Subnet association을 실제 리소스에서 대조한다. 콘솔에서 리소스 자체가 보이지 않는 문제는 다른 리전을 보고 있어서 생기기도 한다.

Private EC2에서 패키지를 설치하지 못한다면 **Private Subnet의 Route Table → NAT 상태 → NAT가 놓인 Public Subnet의 Route Table → Internet Gateway 연결** 순서로 외부 경로를 따라간다. NAT가 `Pending`이거나 Private Subnet에 다른 Route Table이 연결되어 있으면, 화면 어딘가에 올바른 경로가 존재하더라도 그 EC2는 사용하지 못한다. 경로가 이어져 있으면 Security Group과 NACL을 확인하고, 이름 해석에 실패한 경우에는 DNS 설정을 확인한다.

ALB에서 웹 서버로 요청이 전달되지 않을 때는 Public과 Private에 따로 배치했다는 사실을 오류로 보지 않는다. Target Group의 등록 대상·포트·Health Check 상태와 ALB에서 서버로 향하는 Security Group 규칙을 확인한다. 이 단계는 [컴퓨팅](/wiki/platform-delivery-operations-topic-f3ba65e8d3b9/)의 ALB·Auto Scaling 구성으로 이어진다.

주소와 Subnet의 원리는 [IP](/wiki/computer-systems-network-ip-cf75ea1b870d/)와 Subnet, 연결과 이름 해석은 [TCP](/wiki/computer-systems-network-tcp-a7f7f386cd75/)와 [DNS](/wiki/computer-systems-network-dns-c7fd180532b4/)에서 이어서 다룬다. DB의 Private 배치와 연결 오류는 [Aurora](/wiki/aurora/), NAT·Elastic IP 등을 실습 뒤 제거하는 순서는 [비용 관리](/wiki/platform-delivery-operations-topic-342f2ec03420/)에 정리한다.
