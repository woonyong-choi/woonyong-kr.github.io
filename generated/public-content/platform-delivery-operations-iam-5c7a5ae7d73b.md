---
layout: default
title: IAM
nav_order: 8
permalink: /wiki/platform-delivery-operations-iam-5c7a5ae7d73b/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/platform-delivery-operations-iam-5c7a5ae7d73b
projection_sha256: bdfb590cde9ce99600cba230d7189d6028df08a6759d0bb3ab98c6b6e06605cf
parent: 클라우드
content_status: ready
public_parent_id: Wiki/platform-delivery-operations/cloud
grand_parent: DevOps
---

# IAM
{: .no_toc }

IAM은 인증된 주체가 어떤 자원에 어떤 행동을 할 수 있는지 판단하는 권한 체계다. AWS 계정의 root 로그인이나 키를 여러 사람과 배포 프로그램이 공유하면 권한을 좁히고 행위자를 추적하기 어렵다. 사람은 federation과 임시 자격증명, 워크로드는 IAM Role을 우선하고, root는 필요한 계정 작업으로 사용을 제한한다. [AWS IAM 보안 권장사항](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)

## 주체와 자격증명

인증은 누구인지 확인하고, 인가는 그 신원이 무엇을 할 수 있는지 판단한다. 정책을 읽을 때는 요청 주체, `Action`, `Resource`, 조건을 함께 본다.

- IAM User는 계정 안의 지속적인 신원이다. 사람이거나 프로그램을 나타낼 수 있으며, 모든 User가 access key를 갖는 것은 아니다. 장기 access key는 자동 만료를 기대하지 말고 폐기·교체를 관리한다.
- IAM Role은 맡을 수 있는 지속적인 신원과 정책 설정이다. 이를 맡아 얻는 role session의 자격증명이 임시다. Role 자체가 몇 시간 후 없어지는 것은 아니다.
- IAM Group은 User에 권한을 묶어 부여하는 수단이다. Group으로 로그인하거나 요청을 보내지 않으며, resource policy의 `Principal`로 지정할 수 없다. User, role session, AWS 서비스 등 요청 주체와 구별한다. [Principal 정의](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_principal.html)

EC2 애플리케이션용 Role은 instance profile을 통해 인스턴스에 연결한다. 지원하는 SDK의 credential provider가 임시 자격증명을 가져와 요청에 사용한다. 이는 장기 키를 코드에 적지 않는다는 뜻이지 비밀값이 전혀 없다는 뜻이 아니다. 임시 자격증명도 만료 전에는 보호해야 한다. 인스턴스 식별용 instance identity role과 애플리케이션에 권한을 부여하는 Role도 구분한다. [EC2의 IAM Role](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/iam-roles-for-amazon-ec2.html)

## Allow 하나만으로 결론 내리지 않기

적용되는 명시적 `Deny`는 `Allow`보다 우선한다. 그러나 `Allow` 하나만 찾았다고 최종 허용은 아니다. identity policy와 resource policy뿐 아니라 permissions boundary, session policy, 조직의 SCP·RCP, 요청 조건과 계정 경계를 함께 평가한다. 정책 종류와 주체 종류에 따라 합집합·교집합 및 예외가 달라진다. 아래 예제는 이 전체 평가기를 구현하지 않는다. [AWS 정책 평가](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html)

## 객체 읽기와 자원 범위

다음은 가상 버킷에서 객체 읽기를 허용하는 identity policy 예시다. JSON 주석은 허용되지 않으므로 설명은 블록 밖에 둔다. 실제 계정에 적용한 정책은 아니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::example-learning-bucket/*"
    },
    {
      "Effect": "Deny",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::example-learning-bucket/private/*"
    }
  ]
}
```

`private/` 객체 읽기에는 두 문장이 함께 적용되어 거부한다. 나머지 객체는 이 정책에서 허용하지만, 다른 정책·조건에 의해 거부될 수 있다. 쓰기·삭제 권한을 이 정책이 주지 않는다는 사실과 다른 정책에서도 그 권한이 없다는 판단은 다르다. `GetObject`는 객체 내용 읽기이고 버킷 목록을 읽는 `ListBucket`은 별도 권한이다.

ARN은 `arn:partition:service:region:account-id:resource` 구조다. 일반 S3 버킷·객체 ARN의 region과 account-id 필드가 비어 있다는 사실을 모든 S3 자원이 리전과 무관하다는 뜻으로 해석하면 안 된다. 버킷과 객체도 서로 다른 자원 유형이다. [S3 정책의 자원](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-with-s3-policy-actions.html)

## AccessDenied를 좁히는 순서

실제 요청에 쓰인 신원·세션, action, ARN, region·태그 등 조건부터 확인한다. 해당 조합에 적용되는 허용과 거부, 권한 경계, 조직 정책, 자원 정책을 찾는다. 최소 권한은 막을 행동을 모두 열거하는 대신 필요한 작업·자원·조건으로 허용 범위를 좁히는 원칙이다.

다른 클라우드에서도 신원과 권한을 구별하지만 용어를 그대로 대응시키지는 않는다. Azure RBAC의 role assignment는 principal·role definition·scope를 결합하며 Entra ID의 인증과 구분된다. Google Cloud IAM의 allow policy는 principal에 role을 부여하는 binding을 담는다. AWS의 Role을 이 두 서비스의 권한 묶음과 동일시하지 않는다. [Azure RBAC](https://learn.microsoft.com/en-us/azure/role-based-access-control/overview), [Google Cloud IAM](https://cloud.google.com/iam/docs/overview)

웹 애플리케이션의 권한 위임은 [OAuth 2.0](/wiki/backend-services-oauth-2-0-dcd393e8a137/), 도메인 공개키의 신뢰는 [PKI](/wiki/backend-services-pki-136c318c4542/)에서 이어진다. 서로 관련되지만 같은 프로토콜은 아니다.
