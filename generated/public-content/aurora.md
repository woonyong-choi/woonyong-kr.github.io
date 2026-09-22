---
layout: default
title: Aurora
nav_order: 1
permalink: /wiki/aurora/
publication_state: publish
has_toc: true
projection_id: Wiki/platform-delivery-operations/cloud/aurora
projection_sha256: c0355238bff559277207ea6fd824eec13eea6eacb5c8c5fd2320f12b40e7266a
parent: 관리형 서비스
content_status: ready
public_parent_id: Wiki/keywords/platform-delivery-operations-topic-f5955687c1b2
grand_parent: 클라우드
ancestor: DevOps
---

# Aurora
{: .no_toc }

이 실습 구성에서는 Aurora MySQL을 사용하며, 데이터베이스를 private subnet에 두고 웹 계층만 접근하게 제한한다. 웹 서버는 비밀번호를 코드나 설정 파일에 넣는 대신 Secrets Manager에서 접속 정보를 읽는다. EC2에 연결한 IAM Role이 Secret을 읽을 권한을 제공한다. 이 권한과 DB에 로그인할 권한은 서로 다른 경계다.

여기서는 기존 AWS 실습 기록의 구성을 따라 연결 경계를 살펴본다. 아래 리소스 이름은 예시이며, 현재 AWS 계정에서 생성·접속·삭제를 검증했다는 뜻은 아니다.

DB를 만들 때는 접근할 수 있는 주체부터 확인한다. Aurora MySQL 클러스터, DB security group, Secrets Manager, IAM instance profile이 함께 연결되어야 웹 서버가 데이터베이스에 접속할 수 있다.

## 접근 범위와 자격 증명

Public Access, Routing, Security Group을 함께 열면 DB가 인터넷에서 직접 접근 가능한 경로에 놓일 수 있다. 비밀번호를 코드에 넣으면 배포 파일과 로그를 통해 secret이 새어 나갈 수 있다. 개별 웹 서버의 IP만 허용하면 인스턴스 교체 후 규칙을 고쳐야 할 수 있다. 이를 피하려고 IP 대역을 지나치게 넓히면 불필요한 접근까지 허용하게 된다.

이 구성에서는 DB security group source를 웹 인스턴스 security group으로 제한한다. secret은 Secrets Manager에 저장하고 EC2 role에 읽기 권한을 준다. RDS를 삭제할 때는 deletion protection과 snapshot 옵션을 확인한다.

## 웹 서버와 Aurora의 연결 경로

```text
ALB
  -> Auto Scaling EC2 웹 서버
    -> IAM Instance Profile
      -> Secrets Manager에서 DB 접속 정보 읽기
    -> DB Security Group이 허용한 3306 포트로 Aurora MySQL 접속
      -> Aurora writer/reader instance
```

애플리케이션에는 DB endpoint, username, password, dbname이 필요하다. 이 정보를 코드에 직접 두지 않고 secret으로 보관하면 서버가 늘어나도 같은 권한 모델을 반복해서 사용할 수 있다.

## DB 접근 경계

- Security Group
  - 이름: `DB-SG`
  - 설명: `Database Security Group`
  - VPC: `VPC-Lab`
  - inbound
    - type: MySQL/Aurora
    - port: 3306
    - source: `ASG-Web-Inst-SG`

이 실습에서는 source를 개별 IP 대신 웹 서버의 Security Group으로 지정한다. 같은 VPC 안에서 새 인스턴스에도 `ASG-Web-Inst-SG`를 연결하면 DB의 Inbound 규칙을 매번 고칠 필요가 없다. 실제 접속에는 Routing, 웹 서버의 Outbound 규칙과 Network ACL도 맞아야 한다. [Aurora의 Security Group](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Overview.RDSSecurityGroups.html)

## Aurora 클러스터와 인스턴스

- Engine
  - Amazon Aurora
  - MySQL compatible
  - 예시 버전: Aurora MySQL 3 계열
- Template
  - 실습에서는 workshop이 지정한 template을 따른다.
  - 개인 계정에서는 비용을 보고 가장 작은 옵션과 정리 계획을 먼저 확인한다.
- 식별자와 계정
  - cluster identifier: `rdscluster`
  - master username: `awsuser`
  - password: 실습용 값은 교육 환경에서만 사용한다. 개인 계정에서는 새 강한 비밀번호를 만든다.
  - initial database name: `immersionday`
- Network
  - VPC: `VPC-Lab`
  - DB subnet group: private subnet 기반
  - public access: No
  - security group: `DB-SG`
  - port: 3306

Aurora에서는 클러스터와 DB 인스턴스를 나눠서 본다. DB 인스턴스가 요청을 처리하고, 애플리케이션은 용도에 맞는 Endpoint로 연결한다. 쓰기가 필요한 요청에는 현재 Primary 인스턴스를 가리키는 Cluster Endpoint를 사용한다. Reader Endpoint는 읽기 연결을 분산하는 데 사용한다. [Aurora Endpoint](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Overview.Endpoints.html)

## Secret의 접속 정보

- Secret
  - 이름: `mysecret`
  - 종류: RDS credentials
  - host: Aurora endpoint
  - username: DB username
  - password: DB password
  - dbname: `immersionday`

애플리케이션은 secret에서 `dbname`까지 읽어야 한다. DB 이름이 빠지면 접속은 되더라도 사용할 schema를 찾지 못하는 식으로 실패할 수 있다.

## EC2 role의 읽기 권한

- IAM policy
  - 이름: `ReadSecrets`
  - action: `secretsmanager:GetSecretValue`
  - resource: 실습 secret ARN
- IAM instance profile
  - `SSMInstanceProfile`에 연결된 IAM Role에 `ReadSecrets` Policy를 연결한다. Instance Profile 자체에 Policy를 붙이는 것은 아니다.

Instance Profile에 연결한 IAM Role을 통해 애플리케이션이 Secret을 읽는다. `secretsmanager:GetSecretValue`는 필요한 Secret ARN에 한정한다. 고객 관리 KMS Key로 암호화했다면 `kms:Decrypt` 권한과 Key Policy도 확인한다. 이 방식은 장기 Access Key를 파일에 보관할 필요를 줄이지만, 가져온 비밀번호를 로그에 출력해도 된다는 뜻은 아니다. [Secrets Manager의 Secret 조회](https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_GetSecretValue.html)

## 웹 앱의 DB 요청

ALB DNS로 웹 앱에 접속해 DB 연결이 필요한 화면을 연다. 연결에 실패하면 애플리케이션 로그를 먼저 보고 다음 항목을 차례로 확인한다.

- secret 값이 맞는가
- EC2 role에 `GetSecretValue` 권한이 있는가
- DB security group이 웹 인스턴스 security group을 허용하는가
- DB endpoint와 port가 맞는가

## 연결 실패와 삭제 조건

Secret 조회 오류와 DB 접속 오류를 구분한다. `AccessDenied`가 Secret 조회에서 발생했다면 IAM·KMS 권한을 확인한다. DB 연결이 Timeout이라면 Endpoint와 Port, Routing, Security Group을 살펴본다. DB 인증 오류라면 사용자 이름, 비밀번호와 DB 내부 권한을 확인한다.

콘솔에 endpoint가 여러 개 보인다면 writer endpoint와 reader endpoint를 구분한다. 쓰기가 필요한 앱은 writer endpoint를 사용한다.

실습을 마치면 보존할 데이터와 Snapshot을 먼저 정한다. Deletion Protection이 켜져 있으면 해제 여부를 판단해야 하며, 사용하는 콘솔이나 CLI의 클러스터 삭제 절차에 따라 DB 인스턴스도 정리한다. 남겨 둔 Snapshot이나 Secret 등 별도 리소스도 비용 검토 대상이다. [Aurora 클러스터 삭제](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/USER_DeleteCluster.html)

## 관련 문서

- 선행 문서
  - [컴퓨팅](/wiki/platform-delivery-operations-topic-f3ba65e8d3b9/)
- 다음 문서
  - [객체 저장소](/wiki/platform-delivery-operations-topic-fb76e9d2f23a/)
  - [비용 관리](/wiki/platform-delivery-operations-topic-342f2ec03420/)
- 데이터베이스 기본기
  - [Database](/wiki/data-storage/)
  - [DB 인덱스](/wiki/indexes/)

## 실습에서 확인할 질문

- DB security group의 source를 IP가 아니라 웹 인스턴스 security group으로 두는 이유를 설명할 수 있는가?
- Secrets Manager와 IAM role이 왜 같이 필요한지 말할 수 있는가?
- RDS 삭제 전에 확인할 비용과 보호 옵션을 말할 수 있는가?
