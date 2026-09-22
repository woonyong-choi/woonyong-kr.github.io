---
layout: default
title: 비용 관리
nav_order: 10
permalink: /wiki/platform-delivery-operations-topic-342f2ec03420/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/platform-delivery-operations-topic-342f2ec03420
projection_sha256: 83746c7c60d7c55d400f9ecbed40c2f6d573afdadbc2b558e3ebd127f956cd1f
parent: 클라우드
content_status: ready
public_parent_id: Wiki/platform-delivery-operations/cloud
grand_parent: DevOps
---

# 비용 관리
{: .no_toc }

AWS 실습을 끝내고 콘솔을 닫아도 만들어 둔 서버와 저장소는 남는다. 웹 페이지가 더 이상 필요하지 않더라도 EC2, Aurora, NAT Gateway, ALB 같은 리소스는 별도로 정리해야 한다. 비용을 관리하려면 사용량을 확인할 방법과 만든 리소스를 다시 찾는 방법을 실습 전에 준비해야 한다.

## 알림과 지출 중단은 다르다

AWS Billing and Cost Management에서 Budget을 만들고, 개인 실습에 맞는 금액과 알림 받을 이메일을 지정한다. 알림이 도착할 주소를 확인하고 현재 사용량뿐 아니라 예상 비용 기준도 살펴본다.

Budget 알림은 지출 상한을 즉시 집행하는 차단 장치가 아니다. 사용량이 비용에 반영되고 알림이 전달되기까지 지연될 수 있다. 별도의 Budget Action도 적용 대상과 실행 조건이 있으므로, 알림 하나를 설정했다고 모든 리소스가 자동 정지한다고 가정하지 않는다. [AWS Budget 사용 시 고려 사항](https://docs.aws.amazon.com/cost-management/latest/userguide/bcm-lite-use-budget.html)

실습 Region을 정하고, 여러 Region을 사용했다면 사용한 곳을 모두 기억할 수 있게 남긴다. `VPC-Lab`, `Web-ASG`, `Web-ALB`, `rdscluster`, `mysecret`처럼 실습에서 정한 이름과 Tag를 유지하면 만든 대상을 다시 찾기 쉽다. 이름이 비슷하다는 이유만으로 다른 작업의 리소스까지 삭제하지 않도록 실제 연결 관계도 확인한다.

시간이 부족해지면 새 리소스를 더 만드는 대신 지금까지 만든 대상을 확인한다. 생성에 쓸 시간과 마지막 정리에 쓸 시간을 함께 잡아야 한다.

## 무엇이 남아 비용을 만드는가

서비스 이름만으로 비용 위험을 높음·중간·낮음으로 고정할 수는 없다. Instance 크기와 실행 시간, 저장한 양, 요청과 데이터 전송량에 따라 비용이 달라진다. 실습을 마쳤다면 다음 항목을 먼저 살펴본다.

| 확인 대상 | 실습 종료 후에도 살펴볼 부분 |
| --- | --- |
| EC2와 Auto Scaling Group | 실행 중인 Instance, ASG가 Instance를 다시 만드는지, 연결된 EBS Volume |
| RDS/Aurora | DB Instance와 Cluster, 남겨 둔 Backup과 Snapshot |
| NAT Gateway, Elastic IP, ALB | 사용하지 않는 Gateway·공인 IPv4 주소·Load Balancer |
| OpenSearch Serverless | 실습용 Collection과 Vector Store |
| S3 | 현재 Object, 이전 Version, 보존 정책 |
| CloudWatch | Log 보존 기간과 저장량, 사용 중인 Metric 등 |
| Secrets Manager | 더 이상 사용하지 않는 Secret과 삭제 예약 상태 |
| AMI와 Snapshot | AMI 등록 상태뿐 아니라 연결된 Snapshot의 보존 여부 |
| Launch Template, IAM Role·Policy, Bedrock Agent·Flow·Guardrail | 남은 설정과 연결된 유료 리소스, 다른 작업의 사용 여부 |

마지막 행의 설정이 남았다는 사실과 계속 사용 요금이 발생한다는 사실은 구분한다. 반대로 AMI만 등록 해제하고 Snapshot을 남겼다면 저장 비용 검토가 끝난 것은 아니다. 같은 ‘리소스 정리’라도 실행을 끝내는 작업, 데이터를 지우는 작업, 사용하지 않는 설정을 없애는 작업이 서로 다르다.

## 삭제가 막히면 연결을 거슬러 올라간다

VPC를 먼저 삭제하려 하면 그 안의 리소스 때문에 막힐 수 있다. EC2, Load Balancer, NAT Gateway, Interface VPC Endpoint 등이 사용하는 Network Interface(ENI)가 남아 있기 때문이다. 이때는 ENI를 무작정 지우는 대신 어느 서비스가 만들고 사용하는지 찾아 해당 리소스를 정리한다. 콘솔과 CLI가 함께 삭제해 주는 VPC 구성 요소도 다르므로 선택한 절차를 확인한다. [VPC 삭제](https://docs.aws.amazon.com/vpc/latest/userguide/delete-vpc.html)

아래는 AWS 실습 기록의 이름을 사용한 정리 순서다. 실제 삭제에 앞서 계정·Region·대상을 확인하고 보존할 데이터와 Snapshot을 정해야 한다. 현재 계정에서 이 순서로 삭제를 실행했다는 기록은 아니다.

### 웹 서버와 Auto Scaling

ASG가 목표 용량을 유지하는 동안 Instance만 종료하면 새 Instance가 생길 수 있다. 따라서 `Web-ASG`를 먼저 정리하고, 관리하던 Instance의 종료 상태를 확인한다. 이어서 `Web-ALB`, `Web-TG`를 정리하면 요청을 받을 대상과 전달할 경로를 함께 없앨 수 있다.

더 이상 사용하는 곳이 없다면 Launch Template `Web`을 삭제하고 AMI `Web Server v1`을 등록 해제한다. AMI와 연결된 Snapshot의 삭제 여부는 별도로 확인한다. 원본 웹 서버처럼 ASG 밖에 만든 EC2가 남았는지도 보고, Instance 종료 후 남은 EBS Volume도 확인한다. [EBS 기반 AMI 등록 해제](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/deregister-ami.html)

### DB와 Secret

`rdscluster`의 데이터를 보존할지, Final Snapshot이 필요한지 먼저 정한다. Deletion Protection이 켜져 있으면 삭제 전에 해제해야 한다. Aurora의 Reader와 Writer Instance, Cluster는 사용하는 콘솔·CLI 절차에 맞춰 정리하고 모두 종료되었는지 확인한다. 실습 구성에서는 Reader부터 정리한 뒤 마지막 Writer와 Cluster의 삭제를 확인할 수 있다. Snapshot을 남기지 않는 선택을 모든 환경에 일괄 적용해서는 안 된다. [Aurora Cluster 삭제](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/USER_DeleteCluster.html)

DB가 사라져도 Snapshot과 Secret이 함께 없어지는 것은 아니다. 남겨 둔 실습 Snapshot을 확인하고, 다른 앱에서 쓰지 않는 Secrets Manager Secret `mysecret`은 삭제를 예약한다. 삭제 예약과 최종 삭제가 같은 시점은 아니므로 상태를 다시 확인한다.

### S3의 현재 파일과 이전 버전

실습 Bucket 안의 Object를 비운 뒤 Bucket을 삭제한다. Versioning을 켰다면 현재 Object뿐 아니라 이전 Version과 Delete Marker까지 확인한다. 현재 파일 목록이 비어 있다는 사실만으로 모든 저장 데이터가 지워졌다고 판단하지 않는다. 버전 보존 방식은 [객체 저장소](/wiki/platform-delivery-operations-topic-fb76e9d2f23a/)에서 다룬다.

### VPC 주변 리소스

연결된 서비스를 정리한 뒤 실습용 VPC Endpoint와 NAT Gateway를 삭제한다. NAT Gateway를 삭제하면 Elastic IP의 연결은 해제되지만 주소 자체가 계정에서 반환되지는 않는다. 더 이상 필요하지 않은 Elastic IP는 별도로 Release하고, NAT Gateway를 가리키던 Route도 정리한다. [NAT Gateway 삭제](https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-working-with.html)

다음 Security Group이 아직 쓰이는지 확인한다.

- `Immersion Day - Web Server`
- `DB-SG`
- `ASG-Web-Inst-SG`
- `web-ALB-SG`

Instance나 ENI의 사용과 Security Group 사이의 참조를 해제한 뒤 불필요한 Group을 삭제한다. Route Table, Subnet, Internet Gateway의 연결을 확인하고 마지막으로 `VPC-Lab`을 삭제한다. 기본 Security Group이나 기본 Route Table을 먼저 직접 지워야 한다는 뜻은 아니다. VPC 삭제 절차가 처리하는 기본 구성 요소와 사전에 제거해야 할 의존 리소스를 구분한다.

## Bedrock과 연결된 저장소

Bedrock의 Agent나 Knowledge Base를 삭제했다고 연결된 모든 서비스가 사라지지는 않는다. 실습에서 함께 만든 리소스를 관계별로 확인한다.

| 시작점 | 함께 확인할 대상 |
| --- | --- |
| Agent | Agent Alias를 정리한 뒤 Agent 삭제. Action Group에서 호출한 Lambda와 관련 리소스 확인 |
| Flow | 실습용 Flow와 연결된 Prompt, Lambda, IAM Role 확인 |
| Guardrail | Agent 등에서의 연결과 사용 여부를 확인한 뒤 실습용 Guardrail 정리 |
| Knowledge Base | Data Source의 동기화 상태와 삭제 정책, Agent와의 연결, Vector Store, S3 원자료, Service Role·Policy 확인 |

Knowledge Base에서는 변환한 데이터의 삭제 정책과 Vector Store 리소스 삭제가 다르다. Knowledge Base를 삭제해도 Vector Store 자체는 남을 수 있으므로, 실습용 OpenSearch Serverless Collection을 별도로 확인한다. 원자료를 둔 S3와 IAM Role·Policy도 다른 작업에서 사용하는지 확인한 뒤 정리한다. [Bedrock Knowledge Base 삭제](https://docs.aws.amazon.com/bedrock/latest/userguide/kb-delete.html)

## 리소스 상태와 청구 내역 대조

정리 후에는 실습한 Region마다 EC2 Instance, Auto Scaling Group, Load Balancer, Target Group, NAT Gateway, Elastic IP, RDS Database가 남아 있는지 다시 확인한다. S3 Bucket, Secrets Manager, Bedrock의 Agent·Knowledge Base·Flow·Guardrail도 함께 확인한다. 한 Region 화면이 비어 있다고 다른 Region이나 S3 목록까지 확인한 것으로 취급하지 않는다.

그다음 Cost Explorer나 Bills에서 서비스별 비용을 대조한다. 리소스가 사라져도 이미 발생한 사용료는 남으며, 아직 반영되지 않은 비용이 나중에 표시될 수 있다. 다음 날에도 확인하되 이를 모든 요금의 반영 완료 기한으로 가정하지 않는다.

남은 비용이 보이면 서비스와 사용 기간부터 확인한다. 실행 중인 리소스를 놓친 것인지, 보존한 데이터의 비용인지, 삭제 전 사용료가 늦게 반영된 것인지 구분해야 다음 조치를 정할 수 있다.
