---
layout: default
title: 컴퓨팅
nav_order: 4
permalink: /wiki/platform-delivery-operations-topic-f3ba65e8d3b9/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/platform-delivery-operations-topic-f3ba65e8d3b9
projection_sha256: a16b39a1731bda39ef0d33bb587071bf18e0d00a0140d1c0894710fcaa38ebf8
parent: 클라우드
content_status: ready
public_parent_id: Wiki/platform-delivery-operations/cloud
grand_parent: DevOps
---

# 컴퓨팅
{: .no_toc }

웹 서버 한 대에 모든 요청을 보내면 그 서버가 멈췄을 때 요청을 받을 곳도 사라진다. 같은 애플리케이션을 여러 서버에 띄우려면 요청을 나누는 방법과 새 서버를 같은 구성으로 만드는 방법을 함께 정해야 한다. 클라우드의 컴퓨팅 서비스는 실행할 서버와 자원을 제공하며, 여기에 부하 분산과 자동 확장을 연결할 수 있다.

## 실행 중인 서버와 서버를 만드는 설정

AWS에서는 EC2 Instance가 애플리케이션을 실행한다. Application Load Balancer(ALB)는 HTTP 요청을 여러 서버로 나누고, Auto Scaling Group(ASG)은 지정한 수의 Instance를 유지한다. 트래픽에 따라 수를 조절하려면 Scaling Policy도 설정한다.

새 Instance를 만들 때마다 패키지와 애플리케이션을 수동 설치하면 서버마다 설정이 달라지기 쉽다. AMI(Amazon Machine Image)는 서버의 디스크 상태를 바탕으로 Instance를 시작할 이미지를 제공한다. Launch Template은 그 AMI와 함께 Instance Type, Security Group, IAM Instance Profile 등의 생성 설정을 묶는다. AMI가 설치된 파일을 담는다면, Launch Template은 그 이미지로 어떤 Instance를 만들지 정한다.

다음 예에서는 AWS 실습 기록에 남은 설정값으로 각 리소스의 역할을 설명한다. 현재 계정에서 생성하거나 부하를 측정한 결과는 아니며, `t2.micro`의 사용 가능 여부와 요금은 실행할 Region과 계정에서 별도로 확인해야 한다.

## 원본 EC2에서 AMI 만들기

먼저 Public Subnet에서 웹 서버 한 대를 준비한다. 이후에는 이 서버에서 만든 AMI로 Private Subnet에 웹 서버를 늘린다. 이 예제는 `VPC-Lab`과 Subnet이 이미 준비되어 있다고 가정한다.

| 항목 | 실습 설정 |
| --- | --- |
| EC2 이름 | `Web server for custom AMI` |
| Instance Type | `t2.micro` |
| Key Pair | 없음 |
| VPC | `VPC-Lab` |
| Subnet | `VPC-Lab-subnet-public1-ap-northeast-2a` |
| Auto-assign Public IP | Enabled |
| IAM Instance Profile | Systems Manager나 Secrets Manager 접근에 필요한 Role을 연결한 Profile |
| Security Group | `Immersion Day - Web Server` |
| Inbound | HTTP 80, Source는 `My IP` |
| Instance Metadata | IMDSv2 only |

`My IP`는 준비 중인 서버의 웹 페이지를 자신의 IP에서 확인하기 위한 범위다. 인터넷 전체를 허용하는 설정과 다르다. IMDSv2 only는 Instance Metadata 요청에 Token을 요구하는 설정이며, 애플리케이션의 접근 제어까지 대신하지는 않는다.

User Data에서는 웹 서버 패키지를 설치하고 실습 애플리케이션 ZIP을 받은 뒤 Apache HTTP Server를 시작한다. 원본 기록에는 ZIP의 실제 배포 주소와 전체 스크립트가 없으므로 그대로 실행할 완성 명령으로 제시하지 않는다. EC2가 실행 중이어도 이 과정이 실패하면 웹 페이지는 열리지 않는다. System Log, `/var/log/cloud-init-output.log`, HTTP Server 상태를 살펴 설치 실패와 서비스 실행 실패를 구분한다.

웹 서버가 의도한 페이지를 반환하면 이름이 `Web Server v1`, 설명이 `LAMP web server AMI`인 AMI를 만든다. 이후 Instance는 이 이미지의 파일 상태에서 시작한다. AMI를 만든 뒤 원본 서버에서 수정한 파일이 기존 AMI에 자동으로 반영되지는 않는다.

## 외부 요청을 받는 ALB

ALB는 Public Subnet 두 개에 두고, 실제 요청을 처리할 EC2는 Private Subnet에 배치한다. Target Group은 ALB가 요청을 전달할 대상과 Health Check 설정을 묶는다.

| 리소스 | 실습 설정 |
| --- | --- |
| ALB | 이름 `Web-ALB`, Scheme `internet-facing` |
| ALB Subnet | Public Subnet 2개 |
| Listener | HTTP 80 |
| ALB Security Group | `web-ALB-SG`, HTTP 80을 Anywhere IPv4에서 허용 |
| Target Group | 이름 `Web-TG`, Target Type `instances` |
| Target Protocol | HTTP |
| Health Check | HTTP, 애플리케이션이 정상 응답하는 경로 |

사용자는 ALB DNS 주소로 접속한다. ALB가 내부 IP로 웹 서버에 요청하므로 EC2에 Public IP를 줄 필요는 없다. 다만 Private Subnet에 있는 서버가 패키지를 내려받거나 AWS API에 접근해야 한다면 NAT Gateway나 필요한 VPC Endpoint 등 별도의 통신 경로가 필요하다. 들어오는 웹 요청의 경로와 서버에서 외부로 나가는 경로를 구분한다.

## 같은 웹 서버를 만드는 Launch Template

ASG가 새 Instance를 만들 때 사용할 설정은 다음과 같다.

| 항목 | 실습 설정 |
| --- | --- |
| Launch Template 이름 | `Web` |
| 설명 | `Immersion Day Web Instances Template - Web only` |
| AMI | `Web Server v1` |
| Instance Type | `t2.micro` |
| Key Pair | 없음 |
| Security Group | `ASG-Web-Inst-SG` |
| Instance Tag | `Name=Web Instance` |
| IAM Instance Profile | `SSMInstanceProfile` |

`SSMInstanceProfile`은 이 실습에서 쓰는 이름이다. 이름만 같다고 Systems Manager 권한이 생기지는 않으므로, 연결된 IAM Role의 Policy와 서비스에 도달하는 네트워크 경로를 확인해야 한다.

웹 서버의 `ASG-Web-Inst-SG`는 HTTP 80의 Source를 ALB의 `web-ALB-SG`로 제한한다. 다음은 패킷 추적 결과가 아니라 허용할 요청 경로다.

```text
인터넷 사용자
  → web-ALB-SG: HTTP 80 허용
  → ALB
  → ASG-Web-Inst-SG: web-ALB-SG를 Source로 HTTP 80 허용
  → EC2 웹 서버
```

이 설정에서는 사용자가 EC2에 직접 요청하는 대신 ALB를 거친다. EC2의 HTTP Port를 인터넷 전체에 다시 열면 이 구성이 의도한 접근 범위가 달라진다.

## 서버 두 대에서 네 대까지

ASG에는 Instance 생성 설정뿐 아니라 사용할 Subnet과 용량 범위를 지정한다.

| 항목 | 실습 설정 |
| --- | --- |
| ASG 이름 | `Web-ASG` |
| Launch Template | `Web` |
| Subnet | Private Subnet 2개 |
| Target Group | `Web-TG` |
| Desired / Min / Max Capacity | 2 / 2 / 4 |
| CloudWatch Group Metrics | Enabled |
| Scaling Policy | Target Tracking, 평균 CPU 사용률 목표 30% |
| Instance Tag | `Name=ASG-Web-Instance` |

Desired Capacity 2는 현재 유지하려는 Instance 수다. Min 2와 Max 4는 조절 범위이며, 평균 CPU 목표 30%는 Scaling Policy가 용량을 조정할 때 사용하는 지표다. 이 수치를 지정하는 것만으로 모든 요청의 지연 시간이 보장되지는 않는다.

앞의 Launch Template과 ASG에는 `Name` Tag 값이 각각 지정되어 있다. 같은 Key의 Tag를 ASG에서 Instance로 전파하면 ASG 값이 우선하므로, 최종 Instance에 `Name=ASG-Web-Instance`가 붙는지 확인한다. [ASG의 Tag 전파](https://docs.aws.amazon.com/autoscaling/ec2/userguide/ec2-auto-scaling-tagging.html)

사용자의 요청은 `ALB → Target Group에 등록된 EC2`로 전달된다. Instance를 만드는 흐름은 `ASG → Launch Template → AMI와 생성 설정`이다. Launch Template이나 AMI가 HTTP 요청을 처리하는 중간 서버인 것은 아니다.

## 페이지가 열리지 않을 때

먼저 ASG가 만든 Instance가 두 대인지, 각각 의도한 Private Subnet에 있는지 확인한다. 이어서 Target Group의 상태와 ALB DNS에서 받은 응답을 살펴본다. 원하는 수의 Instance가 실행 중인 것과 웹 요청을 처리할 수 있는 상태는 서로 다르다.

| 현상 | 확인할 순서 |
| --- | --- |
| Target이 `unhealthy`다 | HTTP Server 실행 상태 → EC2 Security Group이 ALB를 허용하는지 → Health Check 경로·Port·정상 응답 코드 |
| ALB로 접속하면 일부 요청만 실패한다 | 대상별 Health 상태와 Log → AMI를 만들 때 앱 구성이 완성됐는지 → ASG가 선택한 Launch Template 버전과 그 안의 AMI ID |
| Instance가 계속 교체된다 | ASG Activity History와 교체 사유 → 활성화된 Health Check 종류 → 앱 시작 시간과 Health Check Grace Period |
| CPU가 높아도 기대한 수로 늘지 않는다 | Desired·Min·Max 값 → Target Tracking Policy 연결 → 지표와 Scaling Activity |

ALB의 Health Check가 실패했다고 ASG가 기본적으로 그 Instance를 교체하는 것은 아니다. ASG의 기본 Health Check는 EC2 상태를 기준으로 하며, ALB 결과를 교체 판단에 쓰려면 Elastic Load Balancing Health Check를 ASG에서도 활성화해야 한다. 이 차이를 확인하지 않고 Target Group 상태만 보면 반복 교체의 원인을 잘못 짚을 수 있다. [Auto Scaling Health Check](https://docs.aws.amazon.com/autoscaling/ec2/userguide/health-checks-overview.html)

AMI와 Launch Template의 역할을 구분할 수 있다면, 새 서버에 이전 앱이 뜨는 문제는 생성 설정부터 확인할 수 있다. ALB와 ASG의 역할을 구분할 수 있다면, 요청 실패와 Instance 교체도 서로 다른 근거로 추적할 수 있다. DB 연결은 [Aurora](/wiki/aurora/), 정적 파일 전달은 [객체 저장소](/wiki/platform-delivery-operations-topic-fb76e9d2f23a/), 실습 후 정리는 [비용 관리](/wiki/platform-delivery-operations-topic-342f2ec03420/)로 이어진다.
