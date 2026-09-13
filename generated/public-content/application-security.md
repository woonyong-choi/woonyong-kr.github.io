---
layout: default
title: 애플리케이션 보안
nav_order: 14
permalink: /wiki/application-security/
publication_state: publish
has_toc: true
projection_id: Wiki/security/application-security
projection_sha256: 439ccf275e591f56e604658ef6f87a1a5c830b88e06b8dbf2c1146b4ed7808f3
parent: Backend
content_status: ready
public_parent_id: Wiki/backend-services
---

# 애플리케이션 보안
{: .no_toc }

애플리케이션 보안에서는 입력이 어디서 왔고, 어떤 권한으로 어떤 해석기에 들어가는지 추적한다. 검색어·파일명·템플릿 값 같은 데이터가 SQL, 셸, 런타임의 명령으로 해석되면 인젝션이 생긴다.

## 코드와 데이터의 경계

[SQL Injection](/wiki/backend-services-sql-injection-3d2e3a0d8df5/)은 쿼리 문법, OS command injection은 실행 명령, `eval`·템플릿 인젝션은 런타임 코드의 경계를 넘는다. LDAP·XPath·NoSQL에서도 사용하는 API의 값과 연산자를 구분해야 한다. 모두 문자열 결합만으로 발생하는 것은 아니다. 신뢰하지 않는 객체를 쿼리 연산자나 실행 구조로 직접 받아들이는 것도 경계 위반이다.

따옴표·세미콜론만 지우는 blacklist는 정상 입력을 손상시키면서 다른 문법·디코딩 경로를 놓칠 수 있다. 인코딩된 문자가 언제나 필터를 우회한다는 뜻도 아니다. 실제 디코딩 순서와 sink를 살펴야 한다. 값 바인딩과 안전한 API가 우선이며, 허용 값·길이 검증과 최소 권한을 함께 적용한다. [OWASP SQL Injection 예방](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)

## 셸을 호출하지 않는 실행

파일 처리는 파일 API처럼 해당 작업의 라이브러리를 먼저 사용한다. 외부 프로그램이 필요하면 실행 파일과 옵션을 개발자가 고정하고 데이터를 별도 인자로 전달한다. `shell=False`가 셸 문법 해석을 줄여도 대상 프로그램의 옵션·경로 해석까지 안전하게 만들지는 않는다. `--` 지원 여부, 인자 allowlist, 대상 경로·주소 제한, timeout과 실패 처리를 확인한다. Windows의 `.bat`·`.cmd` 실행에는 별도의 셸 해석 주의가 필요하다. [OWASP 명령 인젝션 예방](https://cheatsheetseries.owasp.org/cheatsheets/OS_Command_Injection_Defense_Cheat_Sheet.html), [Python subprocess 보안](https://docs.python.org/3/library/subprocess.html#security-considerations)

다음 예제는 CPython에서 실행한다. 고정된 Python 프로그램에 무해한 문자열 하나를 전달하며 네트워크나 셸 명령을 실행하지 않는다. Run은 CPython에서 자식 프로세스를 만들어 인자를 전달한다.

```run-python
import subprocess
import sys

value = "hello; still one argument"
result = subprocess.run(
    [sys.executable, "-c", "import sys; print(sys.argv[1])", value],
    shell=False, check=True, capture_output=True, text=True, timeout=5,
)
assert result.stdout == value + "\n"
print(result.stdout, end="")
```

출력은 `hello; still one argument` 한 줄이다. 세미콜론이 들어 있어도 하나의 인자라는 사실을 확인한다. 이 확인이 임의의 외부 프로그램이나 임의의 인자를 안전하다고 보장하지는 않는다.

## 다른 보안 경계와 연결

[XSS](/wiki/backend-services-xss-df97f0d1042a/)는 신뢰받는 페이지 안에서 코드가 실행되는 문제다. [CORS](/wiki/backend-services-cors-dd387fc45dd4/)는 브라우저의 출처 간 응답 읽기 허용이고, [CSRF](/wiki/backend-services-csrf-4c30779ff9b2/)는 사용자의 인증 상태를 이용한 원치 않는 요청이다. 세 문제를 같은 입력 필터 하나로 해결하지 않는다.
