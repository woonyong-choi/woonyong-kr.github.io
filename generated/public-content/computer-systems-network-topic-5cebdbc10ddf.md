---
layout: default
title: 페이지 폴트
nav_order: 3
permalink: /wiki/computer-systems-network-topic-5cebdbc10ddf/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-5cebdbc10ddf
projection_sha256: ef8c8d13d67124633eb9fef58cbd6af4c5fd99a41cde4412faf9b070d97886a5
parent: 가상 메모리 구현
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-83f24986336f
grand_parent: PintOS
ancestor: CS 기초
---

# 페이지 폴트
{: .no_toc }

프로그램이 아직 준비되지 않은 페이지에 `A` 한 글자를 쓰려 한다고 하자. OS가 그 주소의 사용을 허용해 두었어도, 실제 메모리와의 연결은 첫 접근까지 미룰 수 있다. 이때 발생한 페이지 폴트를 처리해 페이지를 준비하면 프로그램은 멈췄던 쓰기를 다시 시도할 수 있다. 반대로 허용하지 않은 주소라면 페이지를 새로 만들어 주는 것이 해결책이 아니다.

이 두 상황을 구별하려면 세 가지를 이어서 봐야 한다. CPU가 **어떤 접근에서 멈췄는지**, OS가 **그 접근을 복구해도 되는지**, 복구 뒤 **어느 명령으로 돌아가는지**다. 아래 PintOS 설명은 VM 빌드와 저장소의 `5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0` 코드를 기준으로 한다.

## CPU가 남긴 주소와 복귀할 명령을 구별한다

x86의 페이지 폴트(`#PF`, 예외 번호 14)는 주소 변환에 필요한 엔트리가 present가 아니거나, 접근 권한·예약 비트 규칙을 어겼을 때 발생한다. 마지막 PTE의 P 비트만 검사하는 사건은 아니다. 구체적인 권한 판정과 A·D 비트의 동작은 [Paging](/wiki/computer-systems-network-topic-dbd836d1a044/)에서 이어서 다룬다.

| 확인할 값 | 이 값으로 알 수 있는 것 |
|---|---|
| `CR2` | 폴트를 일으킨 접근 대상의 가상 주소 |
| 저장된 `RIP` | 폴트를 처리한 뒤 다시 실행할 명령의 주소 |
| 오류 코드의 P, bit 0 | 0이면 변환 과정의 엔트리가 not-present였음 |
| 오류 코드의 W/R, bit 1 | 쓰기 접근이면 1 |
| 오류 코드의 U/S, bit 2 | 사용자 모드 접근이면 1 |

W/R와 U/S는 **실패한 접근**을 설명한다. PTE의 쓰기·사용자 권한을 그대로 복사한 값이 아니다. 오류 코드에는 예약 비트 위반이나 명령어 가져오기 같은 추가 정보도 있으므로, 이 세 비트만으로 모든 원인을 판정하지 않는다. `CR2`도 데이터 주소로 한정되지 않는다. 명령어를 가져오다가 폴트가 났다면 코드 주소를 기록한다. [Intel SDM 092, Vol. 3A, Event 14, 7-47~7-50](https://cdrdv2-public.intel.com/922487/253668-092-sdm-vol-3a.pdf#page=249)

### 오류 코드의 여덟 조합을 읽는 법

먼저 `error_code & 0x7`로 아래 세 비트만 떼어 읽는다. P가 0이면 변환 도중 not-present 엔트리를 만난 것이다. P가 1이면 단순 not-present와 구별해야 하며, 예약 비트 위반 같은 추가 원인은 나머지 비트까지 확인한다.

| 하위 세 비트 | U | W | P | 실패한 접근 |
|---|---:|---:|---:|---|
| `0x0` | 0 | 0 | 0 | 커널 모드의 비쓰기 접근, not-present |
| `0x1` | 0 | 0 | 1 | 커널 모드의 비쓰기 접근, P=1 |
| `0x2` | 0 | 1 | 0 | 커널 모드의 쓰기, not-present |
| `0x3` | 0 | 1 | 1 | 커널 모드의 쓰기, P=1 |
| `0x4` | 1 | 0 | 0 | 사용자 모드의 비쓰기 접근, not-present |
| `0x5` | 1 | 0 | 1 | 사용자 모드의 비쓰기 접근, P=1 |
| `0x6` | 1 | 1 | 0 | 사용자 모드의 쓰기, not-present |
| `0x7` | 1 | 1 | 1 | 사용자 모드의 쓰기, P=1 |

‘비쓰기’에는 데이터 읽기와 명령어 가져오기가 포함될 수 있다. 명령어 가져오기 여부를 표시하는 I/D(bit 4)는 CPU 설정에 따른 조건도 있으므로, W=0이나 I/D=0만 보고 데이터 읽기로 확정하지 않는다. RSVD(bit 3)는 예약 비트 위반, PK(bit 5)는 보호 키 위반을 나타낸다. 현재 PintOS 핸들러는 P·W·U 세 비트로 분기하지만 이것이 오류 코드 전체의 정의는 아니다. [Intel SDM의 오류 코드 정의, 5.7](https://cdrdv2-public.intel.com/922487/253668-092-sdm-vol-3a.pdf#page=149)

`0x6 & 0x1 = 0`, `0x7 & 0x1 = 1`이므로 둘의 차이는 P다. W와 U는 둘 다 1이다. 그러나 `0x6`이라고 모두 지연 적재를 허용하거나, `0x7`이라고 모두 COW를 수행하지는 않는다. 허용 여부는 뒤에서 SPT와 함께 판단한다.

U는 포인터의 소유자를 표시하지도 않는다. 커널이 syscall 처리 중 사용자 주소에 접근하다 폴트가 나면 일반적인 커널 모드 접근의 U는 0이다. 그렇다고 U=0인 모든 폴트가 syscall에서 발생한 것은 아니며, `0x1`·`0x3`만 보고 복구 불가능한 커널 버그로 단정할 수도 없다.

페이지 폴트는 fault이므로 저장된 명령 주소로 돌아가 재시도한다. breakpoint를 만드는 `int3`는 trap이며 그 다음 명령으로 복귀한다. 다음은 두 경우를 구별하기 위해 정한 **별개의 명령 배치**다. 실행 중 얻은 주소나 GDB 출력은 아니다.

```text
쓰기에서 #PF가 난 경우
  0x401010: movb $0x41, (%rax)   ; 3바이트
  0x401013: addq $1, %rbx
  저장된 RIP = 0x401010

int3로 #BP가 난 경우
  0x402000: int3                ; 1바이트
  0x402001: 다음 명령
  저장된 RIP = 0x402001
```

핸들러가 실행되는 동안 현재 RIP는 핸들러의 코드를 가리킨다. 원래 명령을 가리키는 값은 예외 프레임에 보존된다. 복귀 주소를 임의로 다음 명령까지 늘리면 실패한 쓰기를 건너뛰게 된다. 이 예시의 `movb`를 재시도한다는 설명을 모든 명령의 부분 실행 효과가 항상 되돌려진다는 뜻으로 확대해서는 안 된다. [Intel SDM의 fault·trap과 재시작 설명, 7.5~7.6](https://cdrdv2-public.intel.com/922487/253668-092-sdm-vol-3a.pdf#page=207)

## PintOS는 예외 프레임을 보존한 채 VM에 복구를 맡긴다

[`exception_init()`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/exception.c#L33)는 예외 번호 14에 `page_fault()`를 등록한다. CPU의 IDT 예외 전달, 어셈블리 진입부, C 핸들러는 다음 순서로 연결된다.

1. CPU가 복귀에 필요한 상태와 페이지 폴트 오류 코드를 스택에 저장하고, IDT가 지정한 진입점으로 제어를 옮긴다. `CR2`는 이 스택 항목에 포함되는 값이 아니라 별도 레지스터다.
2. `intr0e_stub`가 예외 번호를 넣고 `intr_entry`로 간다. `intr_entry`는 일반 레지스터 등을 추가로 보존한 뒤 `intr_handler()`에 `struct intr_frame`을 넘긴다.
3. `page_fault()`가 `CR2`를 먼저 지역 변수에 보관한다. 이어서 인터럽트를 켜고 오류 코드를 해석한다.
4. `vm_try_handle_fault()`가 `true`를 반환하면 `page_fault()`도 반환한다. 어셈블리 복귀부가 보존한 레지스터를 복원하고 `iretq`로 원래 실행에 돌아간다.

현재 [`page_fault()`의 핵심 부분](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/exception.c#L163)은 다음과 같다.

```c
fault_addr = (void *) rcr2();
intr_enable ();

not_present = (f->error_code & PF_P) == 0;
write = (f->error_code & PF_W) != 0;
user = (f->error_code & PF_U) != 0;

#ifdef VM
if (vm_try_handle_fault (f, fault_addr, user, write, not_present))
    return;
#endif
```

`PF_P`, `PF_W`, `PF_U`는 각각 `0x1`, `0x2`, `0x4`인 오류 코드 마스크다. [`exception.h`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/include/userprog/exception.h)에 정의되어 있으며, CR2를 읽는 `rcr2()`는 [`intrinsic.h`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/include/intrinsic.h#L116)에 있다.

다른 페이지 폴트가 발생하면 CR2가 덮일 수 있어 먼저 읽는다. 이 코드는 복구에 성공했을 때 `f->rip`를 증가시키지 않는다. 예외 프레임을 보존하고 복원하는 실제 코드는 [`intr-stubs.S`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/intr-stubs.S#L10)와 [`struct intr_frame`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/include/threads/interrupt.h#L47)에서 함께 읽을 수 있다.

여기서 사용하는 64-bit IDT 경로는 SS·RSP도 항상 저장한다. 권한 수준이 바뀔 때만 저장하는 이전 모드의 규칙과 다르다. CPU가 저장하는 SS·RSP·RFLAGS·CS·RIP와 #PF 오류 코드는 각각 8바이트 슬롯을 사용하므로 이 부분은 48바이트다. PintOS가 추가로 저장한 레지스터와 정렬 공간까지 포함한 전체 커널 스택 사용량을 뜻하지는 않는다. [Intel SDM의 64-bit 예외 프레임, 7.14.2](https://cdrdv2-public.intel.com/922487/253668-092-sdm-vol-3a.pdf#page=223)

## SPT의 기록과 현재 접근을 함께 확인한다

CPU는 PintOS의 파일이나 스택 성장 정책을 모른다. PintOS는 보조 페이지 테이블(SPT)의 `struct page`에서 가상 페이지의 종류, 쓰기 허용 여부, 초기화에 필요한 정보 등을 찾는다. SPT 기록이 있다는 것과 하드웨어 PTE가 이미 사용 가능한 것은 서로 다른 상태다.

현재 [`vm_try_handle_fault()`와 하위 함수](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/vm.c#L408)는 다음과 같이 분기한다.

| 먼저 확인하는 조건 | 이어지는 처리 |
|---|---|
| 주소가 NULL이거나 커널 주소 영역임 | `false`를 반환한다. |
| not-present가 아닌 폴트 | `vm_handle_write_protect_fault()`로 간다. 쓰기 접근인지, SPT 기록이 있는지, 논리적으로 쓰기를 허용한 페이지인지 확인한다. |
| not-present 폴트 | `vm_claim_spt_page()`가 SPT에서 페이지를 찾고 접근을 확인한 뒤 실제 메모리 준비를 시도한다. |
| 위 SPT 준비가 실패함 | 스택 성장 조건을 검사하고, 허용되면 스택 페이지를 준비한다. |

따라서 **보호 위반이면 무조건 종료한다**는 설명은 현재 구현에 맞지 않는다. 논리적으로 쓰기가 허용된 페이지를 하드웨어에서는 읽기 전용으로 공유하는 COW라면 복구할 수 있다. 현재 쓰기 보호 경로는 실제 프레임의 존재도 확인하고 `vm_handle_cow()`로 이어진다. 복사와 쓰기 가능 매핑의 세부 동작은 [Paging](/wiki/computer-systems-network-topic-dbd836d1a044/)의 COW 설명과 연결해서 읽는다.

반대로 SPT의 `page->writable` 자체가 거짓이면 원래 쓰기를 허용한 페이지가 아니다. not-present 경로의 `vm_handle_unwritable_spt_page()`는 현재 `false`를 반환한다. 이 자리의 COW 관련 TODO 주석을 이미 구현된 처리라고 읽으면 안 된다.

예를 들어 `mmap-ro` 테스트는 스택 범위 밖인 `0x10000000`에 읽기 전용 파일 매핑을 만든 뒤, 그 주소에 처음으로 **쓰기**를 시도한다. 아직 매핑이 present가 아니라면 오류 코드는 `0x6`일 수 있다. CPU는 not-present를 알렸지만, SPT는 쓰기를 허용하지 않는다. 이 경우 SPT 준비가 거부되고 스택 성장 조건도 맞지 않아 복구가 실패한다. 이미 present인 읽기 전용 페이지에 같은 사용자 쓰기를 하면 일반적인 보호 위반의 코드는 `0x7`이다. 두 코드 모두 SPT가 원래 허용한 접근을 함께 봐야 한다. 이 값들은 조건에서 계산한 예시이며 실행 관측값은 아니다. [테스트의 실제 첫 접근](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/mmap-ro.c#L19)

반대로 실행 파일의 `0x8048123`을 처음 읽다가 not-present 폴트가 났다고 하자. SPT에는 페이지 시작 `0x8048000`과 초기화에 필요한 파일 정보가 있고, 아직 claim하지 않았다면 프레임 연결은 비어 있을 수 있다. 페이지 안쪽 위치는 `0x123`이다. 이런 기록이 있으면 지연 적재를 시도할 근거가 된다. `0x1000`처럼 사용자 주소 범위에 속하는 값도 SPT 기록이 없고 스택 성장 조건에 맞지 않으면 복구할 수 없다. 숫자가 작거나 사용자 주소라는 사실만으로 사용할 수 있는 페이지가 되지는 않는다.

SPT 검색은 `spt_find_page()` 안에서 주소를 페이지 시작으로 내린다. 예를 들어 `0x4004a8`은 `0x400000` 페이지의 `0x4a8` 번째 바이트이므로 검색 키는 `0x400000`이다. 하지만 스택 성장 여부는 내린 주소만으로 판단하지 않고 **원래 접근 주소**와 스택 포인터를 비교한다. [SPT 검색 구현](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/vm.c#L143)

### 스택 근처라고 모두 새 페이지를 만들지는 않는다

현재 `vm_should_grow_stack()`는 사용자 모드 접근이면 `f->rsp`, 커널의 사용자 주소 접근이면 스레드가 보관한 `user_rsp`를 기준으로 삼는다. 기준 RSP가 32보다 작지 않아야 하며, 접근 주소가 다음 세 조건을 모두 만족해야 한다.

```text
fault_addr <  USER_STACK
fault_addr >= USER_STACK - STACK_MAX
fault_addr >= 기준 RSP - 32
```

이 저장소의 페이지 크기는 4,096바이트, `USER_STACK`은 `0x47480000`, `STACK_MAX`는 1 MiB다. 따라서 검사하는 스택 주소 범위는 `0x47380000` 이상, `0x47480000` 미만이다. `USER_STACK`은 아래로 자라는 스택의 위쪽 경계다. 32바이트 비교는 이 구현이 채택한 성장 판단 기준이며, 모든 OS의 스택 규칙은 아니다. [성장 조건과 상수](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/vm.c#L452), [주소 상수](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/include/threads/vaddr.h)

`USER_STACK`은 User 가상 주소 공간 안에서 선택한 Stack 경계다. 전체 주소 공간을 나누는 `KERN_BASE`와 User 주소 판별의 한계는 [주소 공간의 Mapping 조건](/wiki/computer-systems-network-topic-3521ee6344f1/#user-주소-판별만으로-mapping을-보장할-수는-없다)에서 설명한다. 하한 아래의 접근도 별도의 유효한 SPT 기록이 있으면 앞의 페이지 준비 경로로 처리할 수 있다. 위 조건은 그 주소를 새 Stack으로 성장시켜도 되는지를 판단한다.

`PUSHA/PUSHAD`는 64-bit 모드에서 유효하지 않으므로 위의 32바이트 조건을 이 명령의 동작으로 설명할 수는 없다. `sub rsp, 24` 뒤에 메모리에 접근했다면 이미 낮아진 RSP를 기준으로 명령과 Fault Frame을 읽는다. [Intel SDM의 PUSHA/PUSHAD 지원 모드](https://www.intel.com/content/dam/www/public/us/en/documents/manuals/64-ia-32-architectures-software-developer-vol-2b-manual.pdf#page=516), [RSP의 주소 산술과 메모리 접근](/wiki/computer-systems-network-cpu-4b05d739f0f6/#같은-register의-다른-크기)

조건이 맞으면 `vm_stack_growth()`가 필요한 아래쪽 페이지를 등록하고 claim한다. 호출한 `vm_grow_stack_and_claim()`는 그 뒤 대상 페이지에 `vm_claim_page()`를 다시 호출한 결과를 반환한다. 이처럼 **성장 조건 통과와 복구 성공은 같은 판정이 아니다**. 또 현재 코드는 SPT 기록이 없을 때뿐 아니라 SPT 준비가 실패한 경우에도 이 성장 검사를 거친다. 할당이나 초기화 실패를 곧바로 ‘허용되지 않은 주소’로 해석하지 말고 어느 함수가 실패했는지 확인해야 한다. [현재 스택 준비 순서](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/vm.c#L323)

1 MiB를 4,096바이트로 나누면 256페이지다. 이는 허용 범위의 크기이며 처음부터 256페이지를 할당한다는 뜻은 아니다. 기준 RSP가 `0x4747f010`, 접근 주소가 `0x4747f008`이면 RSP보다 8바이트 아래라 거리 조건을 만족한다. 하지만 이 주소는 `setup_stack()`이 처음 준비하는 `0x4747f000` 페이지 안에 있다. 거리 조건을 계산한 것만으로 실제 새 스택 페이지가 필요했다고 결론 내릴 수 없다. [초기 스택 준비](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/process.c#L1392)

`vm_stack_growth()`는 요청 주소를 Page 시작으로 내린 뒤, 그 위치가 `stack_bottom`보다 낮은 동안 `while`로 반복한다. 한 Page를 등록하고 claim한 다음에야 `curr->stack_bottom`을 갱신한다. 따라서 한 번의 호출이 여러 Page를 준비할 수 있으며, 도중 할당이나 claim에 실패하면 반복을 끝낸다. [Page별 등록·claim·경계 갱신](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/vm.c#L323-L338)

예를 들어 기존 `stack_bottom`이 `0x4747f000`이고 성장 조건을 통과한 주소가 `0x4747c123`이면 목표 Page는 `0x4747c000`이다. 모든 준비가 성공한다는 가정 아래 한 호출에서 `0x4747e000`, `0x4747d000`, `0x4747c000` 세 Page를 준비한다. 이는 소스의 반복 조건으로 계산한 예시이며 실행 기록이 아니다. 초기 한 Page에서 최대 범위까지 더할 수 있는 255 Page를 255번의 성장 호출이나 Page Fault로 읽어서는 안 된다.

User Stack이 늘어나도 Kernel Thread의 기반 Page가 함께 커지는 것은 아니다. 현재 RSP에서 Thread를 찾는 조건과 Kernel Stack의 가용 공간은 [Thread의 구조체와 Stack 크기](/wiki/computer-systems-network-topic-aebc87b0fcf5/#구조체-크기가-달라지면-stack-공간도-달라진다)에서 구분한다. 파일 Mapping을 준비하는 `do_mmap()`도 요청 Page의 기존 SPT 항목을 검사해 중복을 거부한다. [mmap의 중복 검사](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/file.c#L128-L151)

### syscall이 보관한 RSP와 실제 폴트를 구별한다

사용자 코드가 syscall로 들어오면 `syscall_entry`는 사용자 RSP를 먼저 RBX에 보관한 뒤 커널 스택으로 바꾼다. 보관한 값은 syscall용 `intr_frame`의 RSP 칸에 들어가고, `syscall_handler()`가 다시 `thread_current()->user_rsp`에 기록한다. 그 뒤 커널의 사용자 주소 접근에서 실제 페이지 폴트가 나면, 새 예외 프레임의 RSP는 커널 스택을 가리킨다. 스택 성장 판단에 사용자 스택 위치가 필요한 이유와 `user_rsp`를 따로 저장한 이유가 여기에 있다. [syscall 진입부](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/syscall-entry.S#L9), [사용자 RSP 보관](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/syscall.c#L110)

현재 syscall의 주소 검사에는 페이지를 미리 준비하는 경로도 있다. `try_claim_user_addr()`는 SPT 페이지를 직접 claim하거나, `vm_try_handle_fault()`를 직접 호출한다. 이 직접 호출에서 넘기는 `user=true`는 스택 성장 판단에 들어가면 syscall 프레임의 사용자 RSP를 사용하게 하는 인자이지, CPU가 새 폴트를 발생시켰다는 증거가 아니다. 따라서 **VM 함수의 breakpoint에 걸렸다는 사실과 하드웨어 #PF를 관찰한 사실을 구별해야 한다.** syscall 프레임의 `error_code` 칸도 페이지 폴트 오류 코드로 해석하지 않는다.

이 구현에서 SPT 기록이 없는 syscall 주소를 VM 함수로 넘기기 전에는 `주소 >= f->rsp - 8` 등의 검사를 한 번 더 한다. VM 함수 안의 32바이트 기준과 호출 전 조건이 다르므로, 어느 호출 경로를 거쳤는지 함께 읽는다. 이러한 사전 준비가 있으면 syscall의 첫 버퍼 접근이 반드시 하드웨어 페이지 폴트를 일으키는 것은 아니다. [syscall의 주소 검사와 VM 직접 호출](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/syscall.c#L470)

## 페이지를 채운 뒤 원래 쓰기로 돌아간다

페이지를 claim한다는 것은 SPT의 기록을 실제 접근 가능한 메모리로 준비하는 일이다. 현재 [`vm_do_claim_page()`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/vm.c#L515)의 순서는 다음과 같다.

1. `vm_get_frame()`으로 프레임을 확보한다. 이 함수는 `palloc_get_page(PAL_USER)`를 시도하고, 확보하지 못하면 교체 가능한 프레임을 찾는다. 그 과정도 실패할 수 있다.
2. `frame->page`, `frame->owner_thread`, `page->frame`을 연결한다.
3. `pml4_set_page()`로 가상 페이지와 프레임의 매핑을 설치한다. 설치가 실패하면 이 함수 안에서 프레임과 연결을 정리하고 `false`를 반환한다.
4. `swap_in(page, frame->kva)`으로 내용을 준비하고 그 결과를 반환한다.

이 코드에서는 **PTE를 설치한 뒤 내용을 채운다**. 설치되었다는 사실만으로 읽기와 초기화까지 성공했다고 판단할 수는 없다. 특히 `swap_in()` 실패 때 이 함수는 `false`를 그대로 반환하며, 앞에서 설치한 PTE를 이 자리에서 되돌리는 코드는 없다. 이 설명은 해당 구현의 순서를 읽은 것이며, 모든 OS가 같은 순서를 사용한다는 뜻은 아니다.

여기서 `swap_in`이라는 이름만 보고 매번 swap 디스크를 읽는다고 생각하면 흐름이 끊긴다. 이 호출은 페이지 종류에 연결된 함수로 전달된다. 처음 사용할 `VM_UNINIT` 페이지라면 `uninit_initialize()`가 실제 종류의 초기화를 수행하고 등록된 초기화 함수를 호출한다. [페이지별 호출 방식](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/include/vm/vm.h#L81), [UNINIT의 첫 초기화](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/uninit.c#L50)

이미 익명 페이지로 초기화된 경우에는 `anon_swap_in()`이 swap에 보관된 내용을 복원하고 슬롯을 반환한다. 현재 코드에서 `in_swap`이 거짓이면 대신 페이지를 0으로 채운다. `file_backed_swap_in()`은 파일에서 정해진 범위를 읽고 나머지를 0으로 채운다. **어디서 내용을 가져올지**는 페이지의 상태와 종류가 결정한다. 메모리가 부족할 때 어떤 프레임을 내보낼지는 [페이지 교체](/wiki/computer-systems-network-topic-163345dd1b02/)로 이어지는 별도 판단이다. [익명 페이지 복원](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/anon.c#L57), [파일 페이지 복원](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/vm/file.c#L56)

실행 파일의 [지연 적재](/wiki/computer-systems-network-topic-0a62f7f28b03/)가 첫 초기화의 한 예다. VM 빌드의 `load_segment()`는 파일, 읽을 위치와 길이, 0으로 채울 길이를 기록하고 `lazy_load_segment`를 등록한다. 실제 접근에서 페이지 폴트가 나면 위 claim 경로를 거쳐 그 함수가 프레임에 파일 내용을 읽고 나머지를 0으로 채운다. 복구에 필요한 준비가 성공한 뒤에야 원래 실행으로 돌아갈 수 있다. 미리 모든 페이지를 채우는 비용을 첫 사용 시점으로 나누는 것이다. [등록과 지연 적재 코드](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/process.c#L1301)

이 과정에서 핸들러는 파일 내용을 쓰거나 페이지를 0으로 채울 수 있다. 그러나 처음 예시의 사용자 명령 `movb $0x41, (%rax)`를 대신 수행하는 것은 아니다. 복귀 뒤 CPU가 그 쓰기를 재시도한다.

### 주소 예시로 준비와 재실행을 나누어 본다

다음 값은 흐름을 설명하려고 정한 가정이다. 실제 GDB 관측이나 QEMU 실행 결과는 아니다. 사용자 쓰기를 허용한 SPT 기록이 있고, 그 페이지의 준비가 성공하며, 프레임의 물리 시작 주소가 `0x12345000`이라고 가정한다.

| 시점 | 값과 의미 |
|---|---|
| 접근 시도 | `RAX=0x4747eff8`, 실행할 명령의 주소는 `0x401010` |
| not-present 폴트 | `CR2=0x4747eff8`, 저장된 RIP는 `0x401010`, 오류 코드는 `0x6` |
| 페이지 찾기 | 페이지 시작은 `0x4747e000`, 안쪽 위치는 `0xff8` |
| 매핑 설치 | 이 단순 예시의 P·W·U 플래그가 `0x7`이면 PTE에 기록하는 값은 `0x12345007` |
| 준비 후 복귀 | 원래 명령이 다시 접근할 guest 물리 주소는 `0x12345ff8` |
| 쓰기 성공 후 | 그 위치의 한 바이트가 `0x41`이 되고 다음 명령 `0x401013`으로 진행 |

이 값의 프레임을 커널이 직접 매핑으로 가리키는 주소는 `KERN_BASE + 0x12345000 = 0x8016345000`이다. 커널 주소를 그대로 PTE에 넣는 것이 아니다. 숫자의 역할과 주소 별칭 계산은 [Paging](/wiki/computer-systems-network-topic-dbd836d1a044/)의 설명을 따른다. 실제 관측 시점의 PTE에는 접근에 따른 상태 비트가 더해질 수 있으므로, 표의 초기 설치값을 복귀 이후에도 고정된 값으로 기대하지 않는다.

VM 계층이 끝내 `false`를 반환하면 이 성공 흐름으로 돌아가지 않는다. 현재 `page_fault()`는 사용자 코드에서 발생한 실패를 `process_exit_with_status(-1)`로 처리한다. 나머지는 `kill()`로 전달하며 커널 코드 영역의 복구되지 않은 폴트는 panic으로 이어진다. 커널에서 사용자 주소에 접근하다 발생한 폴트도 VM이 먼저 복구를 시도하므로, 발생 위치만 보고 처음부터 panic으로 단정할 수는 없다. [복구 실패 처리](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/exception.c#L82)

## Linux와 Windows도 사용을 허용한 메모리인지 확인한다

Linux의 VMA는 같은 속성을 가진 연속 가상 주소 범위를 나타낸다. PintOS SPT의 개별 항목은 페이지 단위 정보를 담는다. 둘 다 폴트 처리에 필요한 정책 정보를 제공하지만 같은 자료 구조는 아니다. [Linux 6.16의 VMA 설명](https://docs.kernel.org/6.16/mm/process_addrs.html)

Linux v6.16 x86에서 사용자 주소 공간의 일반적인 처리 경로는 `exc_page_fault → handle_page_fault → do_user_addr_fault`다. VMA를 `lock_vma_under_rcu()`로 찾는 경로와 필요할 때 `lock_mm_and_find_vma()`로 내려가는 경로가 있고, 접근을 검사한 뒤 `handle_mm_fault()`에 메모리 처리를 맡긴다. 결과에 따라 완료, 재시도, SIGSEGV·SIGBUS, 메모리 부족 처리가 갈린다. 사용자 주소 공간이라는 표현에는 커널이 그 주소에 접근한 경우도 포함될 수 있다. [Linux v6.16의 실제 fault 처리](https://github.com/torvalds/linux/blob/v6.16/arch/x86/mm/fault.c#L1209)

Linux v6.16의 `expand_downwards()`는 `VM_GROWSDOWN`으로 표시된 VMA에서 주소 범위와 이웃 Mapping과의 간격을 검사한다. `acct_stack_growth()`의 자원 한도 검사까지 통과하면 VMA와 사용량 기록을 갱신한다. VMA 경계를 옮겼다고 그 사이의 모든 Page가 곧바로 물리 메모리에 준비됐다는 뜻은 아니다. `stack_guard_gap`도 이웃 Mapping과의 간격을 제한하는 값이며, 모든 Stack 아래에 한 Page짜리 guard를 붙인다는 규칙이 아니다. [Linux의 Stack 성장 검사](https://github.com/torvalds/linux/blob/v6.16/mm/vma.c#L2711-L2892), [guard gap의 기본값과 부트 설정](https://github.com/torvalds/linux/blob/v6.16/mm/mmap.c#L886-L900)

실제 환경에서는 `RLIMIT_STACK`의 Soft·Hard Limit와 Stack Mapping을 확인한다. 고정 8 MiB 한도나 고정 ASLR 범위를 전제하지 않는다. 초기 인자 Page의 준비는 [Linux의 최초 Stack](/wiki/computer-systems-network-topic-1217820258bd/#linux의-시작-규약과-비교), NPTL Thread의 기본 크기와 설정 조건은 [함수 호출과 Stack Frame](/wiki/computer-systems-network-topic-3521ee6344f1/#함수-호출과-stack-frame)으로 이어진다.

Signal Handler를 실행할 때도 Stack에 여유가 필요하다. Linux v6.16 x86의 `get_sigframe()`은 원래 User Stack과 `SA_ONSTACK`에 따른 alternate Stack 선택을 구분하고, 64-bit 경로의 128 Byte redzone, FPU 상태 공간과 정렬을 고려해 Frame을 배치한다. 따라서 User RSP에서 Signal Frame 크기만 빼는 계산으로 끝나지 않으며, 이 redzone을 Page Fault의 보편적인 `RSP - 128` 허용 조건으로 사용해서도 안 된다. [Signal Frame에 사용할 Stack 선택](https://github.com/torvalds/linux/blob/v6.16/arch/x86/kernel/signal.c#L86-L160)

Linux에서는 복구에 I/O가 필요했는지에 따라 Minor Fault와 Major Fault를 구분한다. `getrusage()`의 `ru_minflt`는 I/O 없이 처리한 폴트 수이고, `ru_majflt`는 I/O가 필요했던 폴트 수다. 이는 주소와 접근 권한이 유효한지를 가르는 분류와 다르다. [Linux getrusage(2)](https://man7.org/linux/man-pages/man2/getrusage.2.html)

Minor Fault에서도 새 Frame을 준비하거나 RAM에 있는 COW Page를 복사하는 작업이 필요할 수 있다. 따라서 PTE만 고치는 가벼운 작업으로 한정하면 안 된다. Major Fault의 시간도 저장 장치와 대기 상태에 따라 달라지므로 항상 몇 밀리초라고 고정하지 않는다. [Linux의 Page Table과 폴트 처리](https://docs.kernel.org/mm/page_tables.html)

Windows의 VAD(Virtual Address Descriptor)는 프로세스의 가상 주소 범위를 기술한다. WinDbg의 `!vad`로 VAD 하나나 트리를 살펴보면 범위의 시작·끝과 보호 속성 등의 정보를 확인할 수 있다. 이런 정책 정보를 하드웨어 PTE의 현재 매핑 상태와 구별해서 읽는다는 점은 Linux의 VMA, PintOS의 SPT와 비교할 수 있다. 내부 fault 함수의 호출 순서까지 세 OS가 같다는 뜻은 아니다. [WinDbg의 VAD 조회](https://learn.microsoft.com/en-us/windows-hardware/drivers/debuggercmds/-vad)

Windows에서도 주소를 예약한 것만으로 메모리 접근이 허용되는 것은 아니다. reserved 페이지는 접근할 수 없고, committed 페이지는 보호 속성이 허용하는 첫 접근에서 물리 메모리에 준비될 수 있다. COW 매핑이나 guard 페이지도 각각의 정책을 따른다. 특히 guard 접근은 별도의 예외를 발생시키며 guard 속성을 해제하므로 일반적인 not-present 복구와 합치지 않는다. [페이지 상태](https://learn.microsoft.com/en-us/windows/win32/memory/page-state), [보호 속성과 PAGE_GUARD](https://learn.microsoft.com/en-us/windows/win32/memory/memory-protection-constants)

Windows는 Thread마다 Stack의 예약 범위와 처음 commit한 범위를 준비하고, 필요할 때 예약 범위 안의 Page를 추가로 commit한다. 예약한 범위의 한도와 메모리 부족 때문에 확장이 실패할 수 있으며, commit한 범위 전체가 곧바로 RAM에 올라와 있다는 뜻도 아니다. 기본 reserve·commit 크기는 실행 파일 헤더에 있고 Thread 생성 옵션으로 조정할 수 있다. MSVC의 `/STACK:reserve,commit`은 EXE의 기본값을 지정하며, ARM64·x86·x64의 문서상 기본값은 reserve 1 MB와 commit 4 KB다. 이는 변경할 수 있는 링커 설정이다. `CreateThread()`의 `dwStackSize`도 `STACK_SIZE_PARAM_IS_A_RESERVATION` 지정 여부에 따라 해석이 달라지므로, 숫자 하나만 보고 실제 사용 가능한 Stack을 판단하지 않는다. [Windows의 Thread Stack 준비와 확장](https://learn.microsoft.com/en-us/windows/win32/procthread/thread-stack-size), [MSVC의 Stack 설정](https://learn.microsoft.com/en-us/cpp/build/reference/stack-stack-allocations?view=msvc-170)

Windows의 접근 위반 기록을 읽을 때도 명령의 위치와 접근 대상 주소를 구별한다. `ExceptionAddress`는 예외가 발생한 명령의 위치다. `EXCEPTION_ACCESS_VIOLATION`의 `ExceptionInformation[1]`은 접근하지 못한 가상 주소이며, `[0]`은 읽기 0, 쓰기 1, 실행 8을 구별한다. 모든 페이지 관련 실패가 접근 위반 하나로 표현되는 것은 아니며 `EXCEPTION_IN_PAGE_ERROR` 같은 별도 기록도 있다. [EXCEPTION_RECORD의 공식 정의](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-exception_record)

## QEMU는 CPU의 예외 전달을 구현하고 PintOS는 복구를 결정한다

QEMU에서 PintOS를 실행해도 이 역할 구분은 유지된다. QEMU v10.0.0의 x86 TCG 시스템 에뮬레이션은 guest 페이지 테이블을 해석하고 소프트웨어 TLB로 변환을 재사용한다. 일반적인 guest 페이지 폴트는 변환 실패 정보에 예외 번호, 오류 코드, CR2 값을 담는다. 중첩 가상화나 예외 가로채기를 사용하지 않는 일반 경로에서 `x86_cpu_tlb_fill()`은 CR2를 기록하고 `raise_exception_err_ra()`로 예외 처리를 요청한다. 이 함수 안에서 곧바로 PintOS의 C 핸들러를 호출하는 것은 아니다. [QEMU의 변환 실패 처리](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/system/excp_helper.c#L609)

이때 QEMU의 `PG_ERROR_P_MASK=0x1`, `PG_ERROR_W_MASK=0x2`, `PG_ERROR_U_MASK=0x4`와 PintOS의 `PF_P`·`PF_W`·`PF_U`는 같은 x86 오류 코드의 자리를 가리킨다. QEMU가 실패한 접근을 이 비트들로 기록하고, PintOS가 그 값을 해석해 OS 정책을 적용하는 연결이다. [QEMU v10.0.0의 오류 코드 마스크](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/cpu.h#L331)

예외 helper가 상태를 기록하고 TCG 실행에서 빠져나온 뒤, `x86_cpu_do_interrupt → do_interrupt_all → do_interrupt64`가 guest IDT와 예외 프레임을 처리한다. 이 과정에서 복귀할 명령 주소를 guest 스택에 보존하고 현재 명령 주소를 핸들러 진입점으로 바꾼다. 그 다음 PintOS 코드가 실행되며 SPT와 스택 정책으로 복구 여부를 결정한다. [예외 요청](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/excp_helper.c#L91), [예외 전달 진입점](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/system/seg_helper.c#L113), [64-bit 예외 프레임과 RIP 처리](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/seg_helper.c#L925)

따라서 guest의 현재 RIP와 guest 스택의 `f->rip`를 같은 시점의 같은 값으로 취급하지 않는다. 핸들러에서 멈추면 전자는 핸들러 안의 위치를, 후자는 원래 접근을 시도한 명령을 설명한다. CR2가 가리키는 주소 역시 QEMU 프로세스의 host 포인터가 아니라 guest에서 실패한 접근 주소다.

KVM을 사용할 때는 guest 가상 주소에서 guest 물리 주소로 가는 변환과, EPT/NPT가 guest 물리 주소를 host 물리 주소로 연결하는 변환을 구별한다. Guest의 #PF와 두 번째 변환의 EPT violation/NPT fault는 같은 사건이 아니다. 후자는 KVM이 매핑을 보충하거나 MMIO를 처리하는 등 다른 방식으로 해결할 수 있다. [Linux 6.16 KVM의 주소 변환과 폴트 처리](https://docs.kernel.org/6.16/virt/kvm/x86/mmu.html)

TLB 무효화도 실행 방식과 명령에 따라 확인한다. QEMU v10.0.0의 `cpu_x86_update_cr3()`는 CR0.PG가 켜져 있으면 `tlb_flush()`를 호출한다. 이것을 모든 CPU·가속 모드의 모든 CR3 쓰기가 항상 전체 TLB를 비운다는 규칙으로 확대하지 않는다. 같은 TCG 구현에도 페이지 단위 무효화 경로가 있다. [해당 버전의 CR3 갱신](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/helper.c#L173), [페이지 단위 무효화](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/system/misc_helper.c#L503)

## 디버깅에서는 폴트의 원인과 복구 결과를 따로 확인한다

아래는 해당 PintOS 빌드의 심볼과 QEMU에 연결한 GDB에서 사용할 관찰 절차다. 이 문서에서 실행한 기록은 아니다. `page_fault()`에 멈췄을 때는 먼저 예외 프레임을 읽는다. `x/i`는 해당 명령 주소의 메모리를 읽을 수 있을 때 사용한다.

```gdb
break page_fault
continue
p/x f->rip
p/x f->error_code
x/i f->rip
```

`fault_addr`는 함수 진입 순간에는 아직 초기화되지 않았다. 소스를 보며 `fault_addr = (void *) rcr2()`가 실행된 뒤에 읽는다. 고정된 횟수의 `next`가 모든 빌드에서 같은 위치에 도달한다고 가정하지 않는다.

```gdb
p/x fault_addr
p/x f->rsp
```

그다음에는 현재 분기의 사실을 차례로 확인한다. not-present 경로라면 SPT 조회 결과와 `page->writable`, claim의 프레임 확보·매핑·초기화 결과를 본다. 스택 경로라면 사용자 모드인지에 맞는 기준 RSP와 원래 fault 주소를 비교한다. 보호 위반 경로라면 논리적인 쓰기 허용과 COW 처리 결과를 본다. PTE와 실제 바이트를 함께 관찰하는 절차는 [Paging](/wiki/computer-systems-network-topic-dbd836d1a044/)에 연결되어 있다.

호출 경로를 구별하려면 VM 함수에서 호출 스택과 인자를 함께 읽는다. 다음 명령도 실행 결과가 아니라 관찰 절차다.

```gdb
break vm_try_handle_fault
continue
bt
p/x addr
p user
p write
p not_present
p/x ((unsigned long long) addr & ~0xfffULL)
```

`bt`에서 `page_fault()`를 거쳐 왔는지 syscall의 주소 검사에서 직접 왔는지 확인한다. 마지막 계산은 64비트 주소에서 페이지 안쪽 12비트만 지운다. PTE에서 물리 주소를 추출하는 계산과는 구별한다.

| 멈춘 함수 | 그 함수의 범위에서 확인할 값 |
|---|---|
| `vm_try_handle_fault()` | `f`, `addr`, `user`, `write`, `not_present` 인자와 호출자 |
| `vm_claim_spt_page()` | SPT 조회가 끝난 뒤 `page`; NULL이 아니면 `page->va`, `page->writable` |
| `vm_do_claim_page()` | `page` 인자, 프레임 확보 뒤 연결 상태, 매핑·초기화의 각각의 결과 |
| `pml4_set_page()` | `upage`, `kpage`, `rw`; PTE 조회가 끝난 뒤 `pte` |

`pml4_set_page()`에는 `page`라는 지역 변수가 없다. 한 함수의 breakpoint 명령을 다른 함수에 그대로 붙이지 않는다. 컴파일 최적화로 지역 변수가 보이지 않는 경우도 있어 소스 위치와 실제 심볼을 먼저 맞춘다. 또한 `pml4_get_page()`는 present 매핑의 커널 가상 주소를 반환한다. 반환값이 있다는 사실만으로 물리 주소나 쓰기 권한까지 확인한 것은 아니다. GDB에서 이 함수를 호출하는 것은 값을 단순히 읽는 것과도 다르다. [실제 매핑 함수와 변수](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/mmu.c#L231)

Stack의 관찰값을 잠시 보관할 때는 Target Register 이름을 피한다. User에서 발생한 `page_fault()`의 Frame임을 확인했다면 `set $observed_user_rsp = (unsigned long long) f->rsp`처럼 별도의 GDB 편의변수에 담을 수 있다. `set $rsp = ...`는 실제 Target의 RSP를 바꾸는 명령이므로 사용량 관찰에 쓰지 않는다. 커널에서 User 주소를 접근한 Fault라면 현재 Frame의 Kernel RSP 대신 해당 Thread가 보관한 `user_rsp`를 읽어야 한다. [현재 CPU·선택 Frame·저장 Frame의 구분](/wiki/platform-delivery-operations-topic-f89d71c7eb29/#현재-frame과-저장된-frame), [GDB 편의변수의 이름과 수명](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Convenience-Vars.html), [Register 읽기와 쓰기](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Registers.html)

사용량이라는 이름으로 출력하기 전에 계산 대상을 정한다. `USER_STACK - stack_bottom`은 현재 기록된 Stack 경계 사이의 크기이고, 그 값을 Page 크기로 나눈 것은 같은 범위를 Page 단위로 표현한 값이다. `USER_STACK - 관찰한 User RSP`는 꼭대기와 현재 포인터의 주소 차이다. 두 포인터가 기대한 Stack 범위에 있는지 먼저 확인해야 하며, 이 값들이 SPT 항목 수나 현재 RAM에 있는 Frame 수, 살아 있는 데이터량을 직접 세는 것은 아니다.

SPT 페이지 수를 확인하려면 실제 항목을 살펴 Stack 범위와 종류를 구분하고, RAM 점유는 각 항목의 Frame·swap 상태를 별도로 확인한다. `vm_stack_growth()` 진입 시 계산한 Page 수 역시 준비할 범위의 예상치다. 해당 호출이 반환한 뒤 경계와 페이지 상태를 다시 읽어야 성공한 준비와 실패한 준비를 구분할 수 있다. 이 절차는 해당 빌드에서 직접 관찰할 때 사용할 확인 순서다.

### 테스트에서는 이름보다 접근 명령을 본다

다음은 이 커밋의 테스트 소스로 확인한 의도다. 이 문서에서 테스트를 실행하거나 통과 여부·오류 코드를 측정한 기록은 아니다. 프로그램 하나에도 여러 폴트가 날 수 있으므로 테스트 이름에 오류 코드 하나를 붙이지 않는다.

| 테스트 | 소스에서 확인할 접근과 판단 |
|---|---|
| [`pt-grow-stack`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/pt-grow-stack.c) | 4 KiB 지역 배열을 실제로 쓰며 스택 확장을 확인한다. 사용자 쓰기가 not-present에서 실패한다면 `0x6`에 해당한다. |
| [`pt-big-stk-obj`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/pt-big-stk-obj.c) | 64 KiB 지역 배열을 0으로 채우고 ARC4로 암호화한 뒤 checksum을 출력한다. 큰 Stack 객체를 실제로 접근하는 테스트이며, 배열 크기만으로 새 Page 수나 Fault 횟수가 정해지지는 않는다. |
| [`pt-grow-bad`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/pt-grow-bad.c) | RSP보다 4,096바이트 아래를 읽는다. 허용한 거리 밖의 접근을 거부하는지 확인한다. |
| [`pt-grow-stk-sc`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/pt-grow-stk-sc.c#L18) | `read()`가 64 KiB 스택 배열의 아직 쓰지 않은 부분에 데이터를 넣는다. 현재 사전 준비 경로도 확인해야 하므로 커널 #PF가 반드시 발생한다고 가정하지 않는다. |
| [`pt-bad-addr`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/pt-bad-addr.c) | `0x04000000`을 읽는다. 그 주소를 사용할 기록이 없는 접근을 거부하는지 확인한다. |
| [`pt-write-code`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/pt-write-code.c) | `test_main`의 코드 주소에 쓴다. 원래 허용되지 않은 쓰기를 COW로 허용해서는 안 된다. |
| [`cow-simple`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/cow/cow-simple.c#L21) | fork 전후의 공유와 자식 쓰기 뒤 데이터·물리 주소의 분리를 확인한다. 이미 present인 공유 페이지에서 사용자 쓰기 보호 폴트가 발생하는 조건이라면 `0x7`이다. |
| [`mmap-ro`](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/mmap-ro.c#L19) | `writable=0`으로 매핑한 뒤 첫 접근으로 쓰기를 시도한다. 읽기 전용 여부는 not-present에서 시작하더라도 지켜야 한다. |

Stack 성장 테스트의 검사 파일도 함께 읽는다. `pt-grow-stack.ck`와 `pt-big-stk-obj.ck`는 begin·checksum·end 출력을, `pt-grow-stk-sc.ck`는 파일 쓰기와 읽기·내용 비교 메시지를 기대하며 이 세 검사는 종료 코드를 무시한다. `pt-grow-bad.ck`는 User fault 진단을 무시하면서 `exit(-1)`을 포함한 출력을 확인한다. 이들은 테스트가 요구하는 결과이며, 여기서 해당 Kernel 테스트를 실행해 얻은 결과는 아니다. [작은 Stack 객체의 검사](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/pt-grow-stack.ck), [큰 Stack 객체의 검사](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/pt-big-stk-obj.ck), [syscall Stack 버퍼 검사](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/pt-grow-stk-sc.ck), [먼 주소 접근의 검사](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/pt-grow-bad.ck)

특히 `mmap-ro.ck`는 종료 코드를 무시하고, 금지된 쓰기 다음의 오류 메시지까지 진행하지 않는 예상 출력을 확인한다. 이 검사 파일만으로 특정 종료 코드나 `0x6`이 실제로 관측됐다고 주장할 수는 없다. [mmap-ro의 검사 조건](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/tests/vm/mmap-ro.ck#L5)

같은 명령과 주소에서 폴트가 반복된다면 `f->rip`를 다음으로 넘겨 숨기지 않는다. 복구 함수가 실제로 성공했는지, 돌아갈 주소 공간에 필요한 매핑과 접근 권한이 갖추어졌는지를 확인한다. 또한 이 커밋의 `page_fault_cnt`는 VM 복구가 실패한 뒤에 증가한다. 출력된 숫자를 정상적으로 복구된 경우까지 포함한 전체 페이지 폴트 수로 읽으면 안 된다.
