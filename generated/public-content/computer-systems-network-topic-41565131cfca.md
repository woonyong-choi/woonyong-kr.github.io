---
layout: default
title: 커널과 사용자 영역
nav_order: 5
permalink: /wiki/computer-systems-network-topic-41565131cfca/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-41565131cfca
projection_sha256: 42b591551254f6d579972124ef31f1b40abd343d2fefcd4ddee6d1297005fdd7
parent: 커널 구조
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-5cd3e3706e06
search_terms:
- intr_frame
- CPL
- RPL
- SS:RSP
- sysretq
- thread_launch
- intr_entry
- Interrupt Frame
- 저장된 Register
grand_parent: PintOS
ancestor: CS 기초
---

# 커널과 사용자 영역
{: .no_toc }

사용자 프로그램이 커널 함수를 호출한다고 해서 그 프로그램에 커널 권한을 넘겨주는 것은 아니다. CPU는 현재 권한 수준에 맞는 명령과 메모리 접근만 허용하고, 커널은 정해진 진입 경로에서 요청을 처리한 뒤 사용자 실행 상태를 복원한다. 이 경계를 이해하려면 실행 주소뿐 아니라 CS, RFLAGS, Stack과 Page Table을 함께 봐야 한다.

여기서는 [lrn-pintos의 x86-64 구현](https://github.com/woonyong-kr/lrn-pintos/tree/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos)을 기준으로 새 프로그램의 시작, Thread 전환, 인터럽트 복귀와 시스템 콜 복귀를 구분한다. 주소 공간을 준비하는 과정은 [실행 파일 적재](/wiki/computer-systems-network-topic-a6a32eb78db0/), `argc`와 `argv` 배치는 [인자 전달](/wiki/computer-systems-network-topic-1217820258bd/)에서 이어진다.

## 실행 주소와 실행 권한

RIP는 실행할 명령어의 주소이고, CPL은 현재 실행 권한 수준이다. PintOS는 커널에서 CPL 0, 사용자 프로그램에서 CPL 3을 사용한다. 사용자 주소로 RIP를 바꾸는 것만으로 CPL이 바뀌지는 않는다. 반대로 사용자 코드로 복귀할 CS를 골랐더라도 해당 주소의 Page Table Mapping과 접근 권한이 맞아야 명령어를 가져올 수 있다.

파일과 프로세스 같은 OS의 추상화는 사용자 코드가 커널의 자료나 Page Table을 임의로 바꾸지 못한다는 전제 위에 있다. 이처럼 코드가 할 수 있는 일과 접근할 수 있는 범위를 제한하는 것을 보호(Protection)라고 부른다. 현재 명령의 권한, 주소 변환의 접근 조건, 커널 진입 후의 인자 검사를 함께 적용해야 한다. CPU는 명령과 메모리 접근을 검사하고, 커널은 어떤 요청을 제공하며 실패를 어떻게 처리할지 정한다.

CPL(Current Privilege Level)은 현재 CS의 하위 2비트에서 확인한다. x86의 Ring은 0부터 3까지지만 이 PintOS가 쓰는 수준은 0과 3이다. `mov cs, rax`로 CS를 대입하는 명령은 없으며, 단순한 `call`이나 `jmp`로 커널 함수의 주소를 지정한다고 권한이 올라가지 않는다. 아래 Selector의 RPL과 GDT Descriptor의 DPL은 현재 실행 권한인 CPL과 역할이 다르다.

Segment Selector에는 GDT 또는 LDT의 항목 위치와 요청 권한 수준인 RPL이 들어 있다. PintOS의 상수는 다음과 같다. Selector 자체가 코드나 Stack의 주소인 것은 아니다. [Selector 정의](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/include/threads/loader.h)

| 용도 | Selector | Table index | TI | RPL |
|---|---:|---:|---:|---:|
| Kernel Code | `0x08` | 1 | 0, GDT | 0 |
| Kernel Data | `0x10` | 2 | 0, GDT | 0 |
| User Data·Stack | `0x1b` | 3 | 0, GDT | 3 |
| User Code | `0x23` | 4 | 0, GDT | 3 |

Descriptor의 DPL은 해당 Segment의 권한 수준이고, Selector의 RPL은 선택할 때 전달하는 요청 권한이다. CS에 적재된 Selector의 하위 비트로 CPL을 읽을 수 있지만 임의의 Data Selector에서 읽은 RPL을 현재 CPL로 사용해서는 안 된다. 64비트 모드에서 일반 Code·Data Segment의 Base·Limit 역할이 줄어들어도 이런 권한 정보와 TSS Descriptor는 필요하다.

현재 `gdt.c`의 `SEG64`는 Kernel Code·Data에 DPL 0, User Code·Data에 DPL 3을 넣는다. `type=0xa`는 읽을 수 있는 Code, `type=0x2`는 쓸 수 있는 Data Segment다. `SEL_CNT=8`이므로 이 GDT는 8바이트 slot 여덟 개, 총 64바이트이며 GDTR의 limit은 63이다. index 0은 NULL, 1~4는 위 표의 Segment, 5~6은 하나의 16바이트 TSS Descriptor, 7은 0으로 남는다. TSS의 Selector는 `0x28`이다. 이는 이 소스의 배치이며 모든 OS의 GDT 크기가 아니다. [현재 GDT 선언과 적재](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/gdt.c#L62-L125)

다음 예제에서 Selector 값을 바꾸면 Table 위치와 RPL이 어떻게 나뉘는지 볼 수 있다. 비트를 해석하는 예제이므로 해당 GDT Descriptor가 실제로 존재하거나 권한 검사를 통과한다는 뜻은 아니다.

```run-python
selectors = {'kernel code': 0x08, 'kernel data': 0x10,
             'user data': 0x1B, 'user code': 0x23}
for name, selector in selectors.items():
    index = selector >> 3
    table = 'LDT' if selector & 4 else 'GDT'
    rpl = selector & 3
    print(f'{name:11}  0x{selector:02x}  {table}[{index}]  RPL={rpl}')

flags = (1 << 9) | (1 << 1)
assert flags == 0x202
print(f'새 사용자 문맥의 RFLAGS: 0x{flags:x}')
```

`process_exec()`는 `FLAG_IF | FLAG_MBS`, 즉 `0x202`를 저장한다. IF는 Maskable Interrupt 허용 비트이고 MBS는 항상 1로 유지하는 bit 1이다. 인터럽트를 허용한다는 사실과 사용자 코드에 특권 명령을 허용한다는 사실은 다르다.

## 명령어마다 허용 조건을 확인한다

유저 코드가 `hlt`를 실행하려 하면 CPU는 그 명령으로 정지하는 대신 권한 위반을 전달한다. 그러나 시스템 상태에 관계된 명령을 모두 “Ring 0 전용”으로 묶으면 I/O 권한을 잘못 설명하게 된다. 정상적으로 지원되는 명령 형식을 전제로 다음 조건을 구분한다.

| 명령 | 바꾸거나 사용하는 상태 | 권한 조건 |
|---|---|---|
| `mov cr3, rax` | Page Table의 루트 | CPL 0 필요 |
| `wrmsr` | LSTAR 등을 포함한 MSR 쓰기 | CPL 0 필요 |
| `rdmsr` | MSR 읽기 | CPL 0 필요 |
| `ltr`·`lldt` | Task Register·LDTR에 Selector 적재 | CPL 0 필요 |
| `hlt` | CPU 실행 정지 | CPL 0 필요 |
| `lgdt`·`lidt` | GDT·IDT의 위치와 limit | CPL 0 필요 |
| `invlpg`·`invpcid` | TLB 등 주소 변환 Cache의 무효화 | CPL 0과 명령별 기능 지원 필요 |
| `wbinvd` | Cache의 write-back·무효화 | CPL 0 필요 |
| `in`·`out` | I/O Port | CPL과 IOPL을 비교하고, 필요하면 TSS의 I/O Permission Bitmap 검사 |
| `cli`·`sti` | Maskable Interrupt를 허용하는 IF | 이 PintOS의 일반 64비트 실행에서는 CPL ≤ IOPL 필요 |

표에서 CPL 0을 요구하는 명령은 해당 명령과 실행 모드를 지원하는 조건에서 CPL 3의 권한 위반으로 `#GP`를 일으킨다. CPL 0이라는 조건을 만족해도 잘못된 operand·지원하지 않는 기능 등의 검사까지 사라지는 것은 아니다.

`RDMSR`은 읽기 명령이어도 일반적인 보호 모드에서 CPL 0을 요구한다. `RDTSC`로 Time-Stamp Counter를 읽을 수 있다는 사실을 임의의 MSR을 읽어도 된다는 뜻으로 확대하지 않는다. `RDTSC`는 CR4.TSD가 0이면 모든 CPL에서, 1이면 CPL 0에서 실행할 수 있다. 제어 Register도 CR0–CR4의 다섯 개라고 세면 틀린다. CR1은 예약되어 있고, 64비트 모드에서는 CR8도 사용한다. CR3를 쓸 때의 무효화 범위는 명령과 제어 비트에 달려 있다. [Intel SDM의 RDMSR](https://cdrdv2-public.intel.com/922481/253667-092-sdm-vol-2b.pdf#page=552), [RDTSC](https://cdrdv2-public.intel.com/922481/253667-092-sdm-vol-2b.pdf#page=567), [Control Register 접근](https://cdrdv2-public.intel.com/922481/253667-092-sdm-vol-2b.pdf#page=40)

`CPUID`도 모든 환경에서 무조건 허용되는 조회라고 설명하지 않는다. Linux의 기본 설정에서는 실행할 수 있지만, CPU가 CPUID faulting을 지원하면 `arch_prctl(ARCH_SET_CPUID, 0)`으로 호출한 Thread의 사용을 막을 수 있고 이후 실행은 SIGSEGV로 이어진다. ISA의 명령별 조건, OS가 설정한 제어 값, 가상화의 실행 제어를 함께 읽어야 한다. [Linux의 CPUID 실행 설정](https://man7.org/linux/man-pages/man2/arch_prctl.2.html)

IOPL(I/O Privilege Level)은 RFLAGS의 bit 12~13이다. `IN/OUT`은 CPL ≤ IOPL이면 이 권한 검사를 통과하고, CPL > IOPL이면 TSS의 bitmap에서 해당 Port가 허용됐는지 확인한다. 접근 크기에 해당하는 bit 중 하나라도 1이거나 bitmap을 읽는 범위가 TSS limit 밖이면 `#GP`가 된다. `INS/OUTS`도 Port 권한을 검사한다. Bitmap은 `CLI/STI`를 허용하는 수단이 아니다. [Intel SDM의 I/O 권한과 bitmap](https://cdrdv2-public.intel.com/868137/325462-089-sdm-vol-1-2abcd-3abcd-4.pdf)

`CLI/STI`는 IF를 바꾸는 권한과 관련된다. Real Mode·VM86·Protected Virtual Interrupt에는 별도 규칙이 있으므로 위 표를 모든 실행 모드에 그대로 적용하지 않는다. PintOS의 `process_exec()`가 준비하는 `0x202`에서 IOPL은 0이고, 부트 코드는 CR4.PVI를 켜지 않는다. 이처럼 IOPL 0과 CPL 3을 전제로 하는 일반 경로에서는 `CLI/STI`로 IF를 직접 바꾸려 하면 `#GP`가 된다. IF를 끄는 것은 예외나 NMI까지 막는다는 뜻도 아니다. [Intel CLI의 조건 표](https://cdrdv2-public.intel.com/774492/325383-sdm-vol-2abcd.pdf), [PintOS 부트 설정](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/start.S)

이 PintOS는 TSS의 I/O Bitmap을 별도로 초기화하지 않는다. `tss_init()`은 TSS Page를 0으로 채운 뒤 `rsp0`만 설정하고 `iomb`는 0으로 남긴다. `gdt_init()`은 TSS limit에 `sizeof(struct task_state)`, 즉 104를 넣는다. Bitmap 시작 Offset과 limit을 이 상태로 사용하면 TSS 앞부분의 바이트가 Port 허용 bit처럼 읽힐 수 있다. 따라서 “bitmap을 따로 만들지 않았다”는 사실을 “모든 Port를 거부한다”는 뜻으로 해석해서는 안 된다. 이는 초기화 코드와 권한 규칙을 대조한 정적 점검 결과이며 실제 I/O 명령을 실행한 결과가 아니다. [TSS 초기화](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/tss.c#L50-L58), [Descriptor의 limit](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/gdt.c#L95-L110)

## 주소를 알아도 접근 권한은 따로 검사한다

유저 코드가 Kernel 가상 주소를 알고 있더라도, 해당 Mapping이 Supervisor 전용이면 정상적인 User load로 그 내용을 얻을 수 없다. 반대로 Ring 0이라고 미매핑 주소를 읽거나 모든 페이지에 쓸 수 있는 것도 아니다. CPL만 보는 표 대신 접근 종류와 변환 경로의 권한을 함께 읽어야 한다.

Paging의 P·R/W·U/S는 각각 bit 0·1·2이고, NX는 실행을 금지하는 bit 63이다. User 접근에는 변환 경로의 모든 Present·U/S 조건이, User 쓰기에는 모든 단계의 R/W 조건도 맞아야 한다. 마지막 PTE의 U/S 하나만 확인하는 것은 충분하지 않다. CR0.WP는 Supervisor 쓰기에 R/W 보호를 적용할지 결정하며, NX는 CPU의 기능 지원과 IA32_EFER.NXE 활성화를 전제로 한다. NXE=0일 때 Present 엔트리의 bit 63을 세우는 것은 정상적인 실행 금지 설정이 아니라 예약 비트 위반이 될 수 있다. [NX 활성화와 단계별 실행 금지](https://www.intel.com/content/dam/support/us/en/documents/processors/pentium4/sb/25366821.pdf), [NXE가 꺼진 엔트리의 예약 비트](https://cdrdv2-public.intel.com/835748/252046-sdm-change-document.pdf)

Kernel의 User 페이지 접근을 제한하는 기능도 있다. CR4.SMEP(bit 20)는 Supervisor의 User 페이지 명령어 fetch를, CR4.SMAP(bit 21)은 User 페이지 데이터 접근을 제한한다. [Intel SDM의 CR4 정의](https://cdrdv2-public.intel.com/843836/325384-sdm-vol-3abcd-dec-24.pdf#page=75) SMAP이 켜진 상태에서 의도적인 명시적 접근에는 EFLAGS.AC가 관여하며, 지원되는 커널 코드가 `stac`·`clac`으로 그 구간을 제어한다. AC를 바꾼다고 SMEP나 쓰기 보호까지 모두 꺼지는 것은 아니다. 인용한 PintOS 부트 코드에는 SMEP·SMAP·NXE를 켜는 명령이 없다. 실행 중인 제어 레지스터 값은 별도로 확인해야 한다. [Intel의 Supervisor 접근 조건](https://www.intel.com/content/dam/www/public/us/en/documents/manuals/64-ia-32-architectures-software-developer-system-programming-manual-325384.pdf)

Intel의 세대로 보면 SMEP는 Ivy Bridge, SMAP은 Broadwell에서 지원되는 보호 기능이다. Intel의 2014년 소개 자료는 Ivy Bridge를 2012년, Broadwell-Y를 2014년으로 표시한다. 이 연혁은 지원 세대를 이해하는 단서이며, Guest에 노출된 CPU 기능이나 현재 CR4의 활성 상태를 뜻하지 않는다. [Ivy Bridge-EP의 SMEP](https://www.intel.com/content/dam/develop/external/us/en/documents/intel-xeon-processor-e5-2600-v2-product-family-technical-overview.pdf#page=5), [Broadwell의 SMAP 지원](https://xenbits.xen.org/xsa/advisory-183.html), [Intel의 세대 연혁](https://download.intel.com/newsroom/kits/14nm/pdfs/Intel_14nm_New_uArch.pdf#page=7)

TLB hit에서는 Cache에 보관한 변환과 권한 정보를 사용하고, miss에서는 Page Table Walk로 정보를 얻는다. 매번 메모리의 최종 PTE 한 개를 다시 읽는 구조가 아니다. 권한 위반을 예외로 전달한다는 Architecture 규칙만으로 speculative side channel까지 모두 방지한다고 결론 내리지도 않는다. 실제 페이지 권한 조합과 KPTI의 별도 방어는 [Paging의 권한 검사](/wiki/computer-systems-network-topic-dbd836d1a044/#pte의-권한과-page-fault), 변환 Cache는 [TLB와 Page Table Walk](/wiki/computer-systems-network-topic-dbd836d1a044/#tlb에-변환이-없다는-것과-페이지가-없다는-것)에서 이어진다.

이 PintOS의 `is_user_vaddr()`는 주소가 `KERN_BASE=0x8004000000`보다 작은지만 검사한다. 커널이 받은 포인터가 그 범위 안에 있어도 Mapping·읽기/쓰기 권한·버퍼 전체 범위가 유효한지는 별도로 확인해야 한다. 현재 `validate_user_buffer()`와 `copy_in()`·`copy_out()` 경로는 페이지 경계를 따라 검사·복사한다. `is_user_vaddr()`와 `pml4_get_page()` 한 번으로 전체 버퍼를 검증한다는 축약은 이 구현을 설명하지 못한다. 구체적인 실패·복구와 인자 복사는 [시스템 콜의 버퍼 경계](/wiki/computer-systems-network-topic-3cc26725c1cb/#사용자-주소와-kernel-buffer-사이)에서 확인한다.

## CPU의 예외와 OS의 처리 정책

CPU가 `#GP`나 `#PF`를 전달하는 것과 OS가 프로세스를 종료하는 것은 다른 단계다. 현재 PintOS의 `exception_init()`은 vector 13인 `#GP`를 `kill()`에 연결한다. `kill()`은 저장된 `f->cs`가 `SEL_UCSEG`이면 진단 뒤 `thread_exit()`을 호출하고, `SEL_KCSEG`이면 Kernel bug로 `PANIC`한다. `#PF`는 별도의 `page_fault()`로 들어가므로 복구 가능한 VM fault까지 무조건 종료한다고 설명하지 않는다. [예외 등록과 kill 분기](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/exception.c#L33-L128), [Page Fault 복구](/wiki/computer-systems-network-topic-5cebdbc10ddf/#pintos는-예외-프레임을-보존한-채-vm에-복구를-맡긴다)

`#GP`의 Error Code가 0인 단순 권한 위반과 Descriptor 선택에 관련된 오류도 나눈다. 관련 Descriptor가 있으면 Error Code가 테이블과 index 정보를 담을 수 있지만, 그 값을 원래 Selector와 언제나 같다고 읽지는 않는다. `IRETQ` 역시 모든 경우를 CPL 0 전용 명령으로 묶기보다 현재 권한과 복귀 Frame의 검사 조건을 따라 읽는다. [Intel SDM의 General-Protection Exception과 복귀 검사](https://cdrdv2-public.intel.com/922487/253668-092-sdm-vol-3a.pdf)

Linux v6.12의 `exc_general_protection()`은 복구 분기를 먼저 시도하고, 처리하지 못한 사용자 예외를 `gp_user_force_sig_segv()`로 보내 SIGSEGV를 전달한다. 이를 언제나 SIGILL이나 실제 core 파일 생성으로 이어지는 경로라고 단정하지 않는다. Windows에서는 `EXCEPTION_PRIV_INSTRUCTION`이 `STATUS_PRIVILEGED_INSTRUCTION`에 대응하며 SEH에서 예외 코드를 확인할 수 있다. 특정 빌드의 `KiTrap0D`라는 내부 이름을 모든 버전에 고정하지 않는다. [Linux v6.12의 #GP 처리](https://github.com/torvalds/linux/blob/v6.12/arch/x86/kernel/traps.c#L684-L725), [Windows 예외 코드](https://learn.microsoft.com/en-us/windows/win32/debug/getexceptioncode)

사용자 실행 중 커널로 들어오는 계기도 구분해야 한다. 다음 표는 이 PintOS에서 다루는 진입 경로이며 x86의 모든 호출·실행 모드를 나열한 표가 아니다.

| 계기 | 진입을 결정하는 정보 | 구별할 점 |
|---|---|---|
| `SYSCALL` | LSTAR·STAR·Flag Mask | 사용자가 요청 번호와 인자를 넘기며 진입 RIP를 매번 고르지 않음 |
| `INT n` | n번 IDT Gate와 DPL | 소프트웨어가 명시적으로 실행한 명령이며 User 호출 가능 여부 검사 |
| 외부 IRQ | 하드웨어가 전달한 vector와 IDT Gate | `INT n` 명령을 실행한 것이 아님 |
| `#GP`·`#PF` 등의 예외 | 명령 실행·주소 접근 조건과 IDT Gate | Gate DPL 0이어도 User 실행 중 발생한 예외가 전달될 수 있음 |

권한이 바뀌는 IDT 진입에서는 Gate의 Code Selector를 통해 커널 권한으로 들어간다. Gate의 DPL을 `INT n` 호출에 적용하는 규칙과 대상 Code Descriptor의 권한을 혼동하지 않는다. 정확한 Gate 배치는 [Interrupt의 IDT 검사](/wiki/computer-systems-network-topic-c19e34701c6c/#idt는-진입점을-handler-table은-c-함수를-가리킨다)에서 확인한다. 이 PintOS의 `SYSCALL`은 GDT의 CS·SS Descriptor를 매번 읽어 권한을 바꾸는 경로가 아니며 MSR에서 Selector를 계산하고 명령이 정한 속성을 적재한다. [Intel의 기존 SYSCALL 동작](https://cdrdv2-public.intel.com/874240/325462-090-sdm-vol-1-2abcd-3abcd-4.pdf) MSR·RCX·R11·RFLAGS의 변화는 [시스템 콜의 진입 설정](/wiki/computer-systems-network-topic-3cc26725c1cb/#커널은-msr에-진입-규칙을-등록한다)에서 이어진다.

Handler 안의 현재 CS가 `0x08`이라는 사실만으로 어디에서 예외가 났는지 판단할 수 없다. 중단된 실행의 CS는 저장된 프레임에서 읽는다. 이 PintOS에서 `0x23 & 3`은 CPL 3을 나타내지만 `0x1b`는 User Data Selector이므로 사용자 Code의 CS 예로 바꿔 쓰지 않는다.

## intr_frame에 담긴 실행 상태

`struct intr_frame`은 복귀에 필요한 레지스터를 메모리에 담는다. CPU가 자동으로 저장하는 부분과 Assembly가 저장하는 부분이 합쳐져 같은 배치를 이룬다. 새 프로그램이나 새 Thread를 시작할 때는 커널이 그 배치에 맞춰 값을 직접 준비할 수도 있다. [구조체 정의](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/include/threads/interrupt.h)

| 시작 offset | 크기 | 필드 | 복원 방법 |
|---|---:|---|---|
| `0x00` | 120 B | `R.r15`부터 `R.rax`까지 15개 GPR | `movq`로 각각 복원 |
| `0x78` | 8 B | `es`와 padding | 아래 2바이트를 ES에 적재 |
| `0x80` | 8 B | `ds`와 padding | 아래 2바이트를 DS에 적재 |
| `0x88` | 8 B | `vec_no` | 건너뜀 |
| `0x90` | 8 B | `error_code` | 건너뜀 |
| `0x98` | 8 B | `rip` | `iretq`의 첫 항목 |
| `0xa0` | 8 B | `cs`와 padding | `iretq`가 Code Selector 확인 |
| `0xa8` | 8 B | `eflags` | `iretq`가 허용된 Flag 복원 |
| `0xb0` | 8 B | `rsp` | `iretq`가 복귀 Stack Pointer 복원 |
| `0xb8` | 8 B | `ss`와 padding | `iretq`가 Stack Selector 복원 |

전체 크기는 192바이트다. `rip`의 offset은 152바이트, 즉 `0x98`이다. `0xa0`을 RIP의 위치로 읽으면 실제로는 CS slot을 읽게 된다. 또한 `cs`, `ss`, `ds`, `es`는 16비트 필드이지만 각각 padding을 포함한 8바이트 slot을 차지한다. 구조체 크기를 필드 이름의 개수로 계산하면 이 부분을 놓치기 쉽다.

`vec_no`는 Assembly Stub이 넣은 인터럽트 번호다. `error_code`는 예외에 따라 CPU가 넣거나 Stub이 0으로 채운다. 이 둘은 핸들러가 원인을 판단하는 정보이므로 복귀할 CPU 레지스터에 다시 적재하지 않는다. 일반 시스템 콜의 진입 코드는 이 영역을 건너뛸 공간만 확보한다. 프레임의 모든 slot이 모든 진입 경로에서 유효한 값으로 채워진다고 가정하지 않는다.

`intr_frame`은 CPU 전체 상태를 담는 구조체가 아니다. 이 배치에는 CR3, FPU·SIMD Register와 모든 MSR이 들어 있지 않다. 주소 공간은 `process_activate()`와 페이지 테이블 활성화 경로에서 따로 관리한다. Linux의 `pt_regs`와도 저장 목적을 비교할 수 있지만 같은 크기·필드 배치나 전체 Context라고 간주하지 않는다. [현재 PintOS의 구조체와 활성화 경로](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/process.c)

저장된 값은 Frame의 생성 시점과 수정 시점을 함께 읽는다. `syscall_handler()` 안의 현재 RAX와 `f->R.rax`는 서로 다를 수 있고, Handler가 반환값을 쓰면 저장된 RAX의 의미도 syscall 번호에서 복귀 값으로 달라진다. 타이머 Interrupt의 Frame도 항상 User 상태인 것은 아니다. 현재 구현의 Code Selector를 해석해 중단된 실행이 User인지 Kernel인지 확인하며, 64 Bit Interrupt 진입에서는 같은 CPL이어도 SS와 RSP가 저장된다. [현재 Interrupt Stub](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/intr-stubs.S), [QEMU v10.0.0의 64 Bit Interrupt 구현](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/seg_helper.c)

현재 CPU와 저장된 Frame을 같은 중단점에서 비교하는 순서는 [Debugger](/wiki/platform-delivery-operations-topic-f89d71c7eb29/)에서 이어서 확인한다.

## do_iret가 복원하는 순서

`do_iret(tf)`는 먼저 현재 RSP를 프레임 시작 주소로 바꾼다. 이어 15개 GPR을 복원하고 ES와 DS를 적재한 뒤, RSP를 `tf->rip`까지 옮겨 `iretq`를 실행한다. 아래 Assembly는 실제 함수에서 중간 GPR 복원만 생략한 설명용 발췌다. 일반 사용자 프로그램이나 브라우저에서 실행할 수 있는 코드는 아니다. [do_iret와 thread_launch](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/thread.c)

```asm
movq tf_address, %rsp     # 설명용: 실제 inline assembly의 입력 operand
movq 0(%rsp), %r15
# ... r14부터 rbx까지 복원 ...
movq 112(%rsp), %rax
addq $120, %rsp
movw 8(%rsp), %ds
movw (%rsp), %es
addq $32, %rsp            # ES, DS, vec_no, error_code 영역 통과
iretq                    # 현재 RSP는 tf->rip을 가리킨다
```

첫 `movq` 이후에는 이 함수가 원래 사용하던 호출 Stack을 그대로 쓸 수 없다. 그렇다고 Kernel Stack 메모리를 해제한 것은 아니다. RSP가 복원용 프레임을 가리키도록 바뀐 것이며, 곧 프레임 안의 새 RSP를 복원한다. 이 중간에 C 함수 호출이나 임의의 `push`를 끼워 넣으면 프레임을 훼손할 수 있다.

**64비트 모드의 `iretq`는 CPL이 같아도 RIP, CS, RFLAGS, RSP, SS의 5개 slot을 사용한다.** 따라서 커널 Thread 사이의 전환에서도 저장된 SS:RSP로 돌아간다. 같은 CPL이면 앞의 3개 slot만 사용한다는 설명은 여기의 64비트 복귀 규칙과 맞지 않는다. Compatibility Mode의 규칙과 구분해야 한다. [Intel SDM Volume 3A, 6.14.3–6.14.4](https://www.intel.com/content/dam/www/public/us/en/documents/manuals/64-ia-32-architectures-software-developer-vol-3a-part-1-manual.pdf)

`iretq` 자체가 RDI, RSI, RAX까지 복원하는 것은 아니다. 그 레지스터들은 앞의 `movq`에서 복원된다. 최초 프로그램의 `argc`·`argv`와 fork 자식의 반환값도 이 구분을 따라 전달된다.

다음 코드는 192바이트 프레임을 구성하고 복원에 사용되는 값을 읽는다. 주소는 배치를 설명하기 위한 값이다. CPU Emulator가 아니므로 GDT 검사, 예외, Flag masking이나 실제 권한 전환은 실행하지 않는다.

```run-python
import struct

gpr_names = ('r15', 'r14', 'r13', 'r12', 'r11', 'r10', 'r9', 'r8',
             'rsi', 'rdi', 'rbp', 'rdx', 'rcx', 'rbx', 'rax')
offsets = {name: 8 * i for i, name in enumerate(gpr_names)}
offsets.update(es=120, ds=128, vec_no=136, error_code=144,
               rip=152, cs=160, rflags=168, rsp=176, ss=184)

def make_frame(cs, ss, rip, rsp):
    frame = bytearray(192)
    for index, name in enumerate(gpr_names):
        struct.pack_into('<Q', frame, offsets[name], index + 1)
    for name, value in {'rip': rip, 'rflags': 0x202, 'rsp': rsp}.items():
        struct.pack_into('<Q', frame, offsets[name], value)
    for name, value in {'cs': cs, 'ss': ss, 'ds': ss, 'es': ss}.items():
        struct.pack_into('<H', frame, offsets[name], value)
    return frame

for label, cs, ss, rip, rsp in (
    ('커널 복귀', 0x08, 0x10, 0x8004001234, 0x8004010F00),
    ('사용자 진입', 0x23, 0x1B, 0x400120, 0x4747FFA0),
):
    frame = make_frame(cs, ss, rip, rsp)
    gprs = {name: struct.unpack_from('<Q', frame, offset)[0]
            for name, offset in offsets.items() if name in gpr_names}
    cursor = 120 + 32
    restored = struct.unpack_from('<5Q', frame, cursor)
    next_rip, cs_slot, flags, next_rsp, ss_slot = restored
    assert len(frame) == cursor + 40 == 192
    assert next_rsp == rsp
    assert next_rip == rip
    assert gprs['rax'] == 15
    assert struct.unpack_from('<H', frame, 0xA0)[0] == cs
    print(f'{label}: CPL={cs_slot & 3}, RIP=0x{next_rip:x}, RSP=0x{next_rsp:x}')
    print(f'  GPR 120 B + 중간 영역 32 B + iretq 영역 40 B = {len(frame)} B')
    print(f'  CS=0x{cs_slot:x}, SS=0x{ss_slot:x}, RFLAGS=0x{flags:x}')
```

두 경우 모두 프레임 끝까지 40바이트를 읽고, 결과의 RSP는 입력에 저장한 `rsp` 값이 된다. 현재 프레임에서 24바이트를 소비한 주소를 복귀 RSP로 삼는 모델과 결과를 비교해 보면 같은 CPL의 복귀에서도 Stack 전환이 필요한 이유가 드러난다.

## 같은 복원 코드가 서로 다른 실행을 시작한다

복원할 프레임을 어디에서 준비했는지에 따라 `do_iret()`의 의미가 달라진다.

| 준비하는 경로 | RIP | RSP | CS | 실행 결과 |
|---|---|---|---|---|
| 새 Kernel Thread | `kernel_thread` | 새 Thread의 Kernel Stack | `0x08` | 등록한 함수와 aux로 실행 시작 |
| 이미 실행한 Thread의 `thread_launch()` | `out_iret` | 이전에 저장한 Kernel Stack 위치 | `0x08` | 중단된 커널 실행 재개 |
| `process_exec()` | ELF의 `e_entry` | 인자 배치를 끝낸 User Stack | `0x23` | 새 사용자 프로그램 시작 |
| `__do_fork()` | 부모의 시스템 콜 다음 명령 | 복제한 사용자 문맥의 RSP | 부모의 User CS | 자식에서 fork가 0을 반환한 흐름 재개 |

`thread_launch()`는 현재 실행 상태를 `running_thread()->tf`에 **저장**한다. `call __next`로 얻은 주소에 Label 간 거리를 더해 `out_iret`의 주소를 구하고, 현재 RSP와 SS도 프레임에 기록한다. 이후 다음 Thread의 프레임을 `do_iret()`에 전달한다. 다음에 원래 Thread가 선택되면 `out_iret`에서 이어진다. Thread를 처음 만들 때는 아직 재개할 위치가 없으므로 `thread_create()`가 `kernel_thread`를 RIP로 준비한다.

`process_exec()`는 새로운 지역 변수 `struct intr_frame _if`에 사용자 Segment와 Flag를 설정하고 `load()`에 전달한다. 적재 성공 뒤에는 `do_iret(&_if)`를 호출하고 원래 C 호출 위치로 돌아오지 않는다. 다음 코드는 전체 오류 처리와 주소 공간 준비를 생략해, 프레임에 넣는 값만 나타낸 것이다.

```c
struct intr_frame _if;
_if.ds = _if.es = _if.ss = SEL_UDSEG;
_if.cs = SEL_UCSEG;
_if.eflags = FLAG_IF | FLAG_MBS;

/* load() 성공 시 rip, rsp, R.rdi, R.rsi가 준비된다. */
do_iret(&_if);
```

이 선언은 프레임 전체를 0으로 초기화하지 않는다. 명시적으로 설정한 필드와 아직 값을 보장하지 않은 필드를 구분해야 한다. 특히 exec 진입 시 RAX가 0이라거나 모든 GPR이 초기화되었다고 예상해서는 안 된다. 이는 첫 인자를 RDI와 RSI에 전달하는 계약과 별개의 구현 점검 사항이다.

fork 자식은 부모의 프레임을 복사한 뒤 `if_.R.rax = 0`으로 바꾼다. 사용자 주소 공간과 필요한 자원 복제를 마치고 부모에게 준비 완료를 알린 다음 `do_iret(&if_)`로 들어간다. 같은 RSP 값이더라도 부모와 자식의 주소 공간이 서로 다를 수 있다는 점도 함께 봐야 한다. 자원 복제와 부모·자식 동기화는 [프로세스 생성](/wiki/computer-systems-network-topic-4af2e32913a4/)에서 다룬다. [exec와 fork 구현](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/process.c)

## 인터럽트와 시스템 콜은 복귀 경로가 다르다

현재 구현의 `intr_entry`는 핸들러를 호출한 뒤 자체 Assembly로 GPR과 Segment를 복원하고 `iretq`를 실행한다. `do_iret()`와 같은 프레임 배치를 쓰지만 C 함수 `do_iret()`를 호출하는 경로는 아니다. 인터럽트 번호와 예외별 error code를 준비하는 실제 Stub Macro도 함께 읽어야 한다. 파일의 오래된 32비트 주석에 등장하는 EBP 저장 설명을 현재 Macro의 동작으로 옮기지 않는다. [인터럽트 진입·복귀 Assembly](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/intr-stubs.S)

일반 시스템 콜은 `syscall_entry`가 처리한다. 사용자 RSP를 보관하고 TSS의 `rsp0` 값을 읽어 Kernel Stack으로 옮긴 뒤 프레임을 만든다. 핸들러가 반환하면 저장된 RIP를 RCX에, Flag를 R11에, 사용자 Stack 위치를 RSP에 옮기고 `sysretq`를 실행한다. 따라서 PintOS가 모든 복귀에서 `iretq`만 사용한다고 설명하면 실제 구현과 어긋난다. [시스템 콜 진입·복귀 Assembly](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/syscall-entry.S)

| 경로 | 사용자 상태를 복원하는 방식 |
|---|---|
| 새 이미지와 fork 자식 | `do_iret()`의 `iretq` |
| 인터럽트·예외 핸들러가 정상 반환 | `intr_entry` 끝의 `iretq` |
| 일반 시스템 콜 핸들러가 정상 반환 | `syscall_entry` 끝의 `sysretq` |
| exit 또는 복귀하지 않는 exec | 원래 시스템 콜 반환 위치에 도달하지 않음 |

`sysretq`는 Stack에서 `iretq` 프레임을 읽는 명령이 아니다. Code·Stack Selector는 MSR 설정에 따르며, PintOS는 `syscall_init()`에서 `MSR_STAR`를 설정한다. RSP도 `sysretq` 앞의 Assembly가 직접 복원한다. [MSR 설정](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/syscall.c)

TSS의 `rsp0`는 사용자 모드로 나갈 때의 Stack Pointer가 아니다. `process_activate()`는 Page Table을 활성화하고 `tss_update()`로 다음 Thread의 Kernel Stack 위치를 기록한다. 사용자 모드에서 커널로 들어오는 인터럽트는 그 경로에서 TSS를 사용할 수 있고, 이 구현의 `syscall_entry`는 TSS를 소프트웨어로 읽는다. 반대 방향의 `iretq`는 자신에게 전달된 프레임의 `rsp`를 복원한다. [TSS 갱신](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/tss.c)

## TSS에는 다음 진입에 사용할 Stack을 기록한다

이 PintOS의 부팅 코드는 `tss_init()`, `gdt_init()`, `intr_init()` 순서로 실행한다. 첫 함수가 TSS용 Page를 할당하고 `rsp0`를 초기화한다. `gdt_init()`은 TSS의 주소를 GDT Descriptor에 기록하고 GDTR을 적재하며, `intr_init()`에서 `ltr(SEL_TSS)`로 TR에 TSS Selector를 적재한다. GDT를 적재하는 `lgdt`와 TSS를 선택하는 `ltr`는 서로 다른 명령이다. [부팅 순서](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/init.c#L105-L119), [GDT 설정](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/gdt.c), [TR 적재](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/interrupt.c#L228-L232)

`SEL_TSS=0x28`은 GDT index 5를 뜻한다. 64비트 TSS Descriptor는 16바이트이므로 GDT[5]와 GDT[6] 두 칸을 사용한다. Descriptor에 넣은 TSS Base는 구조체의 선형 주소이며, 그 주소를 실제 메모리로 번역하는 일은 Paging 경로를 거친다. TR은 Selector와 함께 Descriptor에서 얻은 Base·Limit·속성을 보관한다. TSS의 내용 전체를 TR 안에 복사하는 것은 아니다.

GDB에서 이 등록을 확인하려면 GDT[5]와 GDT[6]을 각각 64비트 값으로 읽는다. 첫 값의 bit 16–39는 Base의 하위 24비트, bit 56–63은 그다음 8비트다. 두 번째 값의 하위 32비트가 Base의 상위 32비트다. 이 세 부분을 이어 붙인 주소를 `tss` 포인터와 비교한다. 그 주소에서 `rsp0`·`rsp1`·`rsp2`와 IST 필드를 읽으면 Descriptor에 등록한 위치와 TSS에 기록한 Stack 값을 구분해 관찰할 수 있다.

`struct task_state`는 `packed`로 선언돼 있다. 앞의 4바이트 다음에 `rsp0`가 오며, IST1은 `0x24`, IST7은 `0x54`에서 시작한다. `rsp0`와 IST1 사이에는 `rsp1`·`rsp2`와 예약 영역이 있다. 마지막 `iomb`는 I/O Permission Bitmap의 시작 위치를 표현하는 필드다. 이 구현은 TSS용 Page를 0으로 초기화하고 `rsp0`를 설정한다. [TSS 선언](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/include/userprog/tss.h), [초기화와 갱신](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/tss.c)

IST(Interrupt Stack Table)는 NMI·Double Fault·Machine Check처럼 현재 Stack 상태를 가정하기 어려운 상황에 별도 Stack을 선택하는 데 쓰인다. IDT Gate의 IST가 0이 아니면 CPL이 같아도 해당 TSS 항목의 Stack으로 전환한다. 이 PintOS는 TSS를 0으로 초기화하고 `make_gate`의 IST도 0으로 설정하므로 IST Stack을 사용하지 않는다. User에서 Ring 0으로 들어오는 IDT 경로에서는 `rsp0`를 사용한다. [IST의 용도](https://docs.kernel.org/arch/x86/kernel-stacks.html), [PintOS의 Gate](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/interrupt.c#L78-L96)

### Page 끝과 현재 Stack 위치를 구분한다

`tss_update(next)`가 기록하는 값은 `(uint64_t)next + PGSIZE`다. 이 값은 Thread Page 바로 다음 주소인 Stack 꼭대기다. 아직 아무것도 쌓지 않아 RSP가 꼭대기에 있을 때 `RSP & ~0xfff`를 계산하면 다음 Page가 나온다. 프레임을 쌓은 뒤 Page 안에 들어온 RSP에 같은 계산을 적용하는 경우와 다르다.

이 4 KiB Page의 아래쪽에는 `struct thread`, 위쪽에는 아래로 자라는 Kernel Stack이 있다. `setup_stack()`이 `USER_STACK` 아래에 준비하는 User Stack은 별도의 Mapping이다. 사용자 Stack의 시작과 확장은 [실행 파일 적재](/wiki/computer-systems-network-topic-a6a32eb78db0/)와 [Page Fault](/wiki/computer-systems-network-topic-5cebdbc10ddf/)에서 이어서 확인한다.

커널 전용 Thread는 사용자 프로그램을 실행하지 않으므로 User Stack을 따로 준비할 필요가 없다. 사용자 프로그램을 실행하는 Thread에서는 두 Stack이 서로 다른 일을 맡는다. 커널은 사용자가 바꿀 수 있는 RSP나 Mapping에 자신의 호출 Frame을 맡기지 않는다. 별도로 준비한 Kernel Stack으로 옮긴 뒤 요청을 처리한다. 이 분리는 커널이 쌓는 데이터를 User Stack에 남기지 않게 하지만, 그것만으로 모든 메모리 접근을 막는 것은 아니다. Kernel Mapping의 접근 권한과 올바른 Stack 교체, 사용자 포인터 검사가 함께 필요하다. 권한 검사는 [Paging](/wiki/computer-systems-network-topic-dbd836d1a044/#pte의-권한과-page-fault), 커널이 사용자 버퍼를 읽는 과정은 [시스템 콜](/wiki/computer-systems-network-topic-3cc26725c1cb/#사용자-주소와-kernel-buffer-사이)에서 이어진다.

`setup_stack()`은 `USER_STACK=0x47480000` 바로 아래의 4 KiB 페이지 하나를 먼저 준비한다. non-VM 빌드에서는 User Pool에서 페이지를 얻어 Mapping을 설치하고, VM 빌드에서는 SPT에 등록한 뒤 `vm_claim_page()`까지 성공해야 RSP를 설정한다. 이후 인자를 쌓으면 사용자 실행을 시작할 RSP는 이 꼭대기보다 낮아진다. [두 빌드의 초기 Stack 준비](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/process.c#L1256), [VM 경로](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/process.c#L1392)

이 구현의 VM Stack 성장 범위는 `STACK_MAX=1 MiB`, 즉 256페이지다. 처음부터 그만큼 할당하는 것은 아니며, 주소·RSP 조건이 맞아도 페이지 준비가 실패할 수 있다. 구체적인 범위와 성장 조건은 [페이지 폴트의 Stack 성장 판단](/wiki/computer-systems-network-topic-5cebdbc10ddf/#스택-근처라고-모두-새-페이지를-만들지는-않는다)에서 확인한다. User Stack이 늘어난다고 위의 4 KiB Kernel Thread Page도 함께 늘어나는 것은 아니다.

아래 C 예제는 TSS와 같은 배치의 구조체를 만들고 주소를 계산한다. 일곱 IST 필드는 배열로 표현했다. 커널 메모리를 할당하거나 실제 TR·RSP를 바꾸는 프로그램은 아니며, 주소는 계산을 위한 값이다.

```run-c
#include <assert.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>

struct Tss {
    uint32_t reserved1;
    uint64_t rsp0, rsp1, rsp2, reserved2;
    uint64_t ist[7];
    uint64_t reserved3;
    uint16_t reserved4, iomb;
} __attribute__((packed));

int main(void) {
    _Static_assert(sizeof(struct Tss) == 104, "TSS size");
    _Static_assert(offsetof(struct Tss, rsp0) == 4, "RSP0 offset");
    _Static_assert(offsetof(struct Tss, ist) == 36, "IST1 offset");
    _Static_assert(offsetof(struct Tss, iomb) == 102, "I/O bitmap offset");

    const uint64_t thread = UINT64_C(0x8004200000);
    const uint64_t page_mask = ~UINT64_C(0xfff);
    struct Tss tss = {.rsp0 = thread + 4096};
    uint64_t frame = tss.rsp0 - 192;
    printf("TSS=%zu, rsp0=%zu, IST1=%zu, iomb=%zu\n",
           sizeof tss, offsetof(struct Tss, rsp0),
           offsetof(struct Tss, ist), offsetof(struct Tss, iomb));
    printf("thread=0x%llx, rsp0=0x%llx, frame=0x%llx\n",
           (unsigned long long)thread, (unsigned long long)tss.rsp0,
           (unsigned long long)frame);
    printf("page(top)=0x%llx, page(top-8)=0x%llx\n",
           (unsigned long long)(tss.rsp0 & page_mask),
           (unsigned long long)((tss.rsp0 - 8) & page_mask));
    assert((tss.rsp0 & page_mask) == thread + 4096);
    assert(((tss.rsp0 - 8) & page_mask) == thread);
    assert(frame == thread + 0xf40);
    return 0;
}
```

출력:

```text
TSS=104, rsp0=4, IST1=36, iomb=102
thread=0x8004200000, rsp0=0x8004201000, frame=0x8004200f40
page(top)=0x8004201000, page(top-8)=0x8004200000
```

전체 TSS 구조체는 104바이트이고 `rsp0`의 Offset은 4다. 같은 Thread Page에서 192바이트 프레임을 쌓으면 시작 위치는 Page 안의 `0xf40`이 된다. 실제 Stack에는 C 호출의 복귀 주소와 지역 변수도 들어가므로 이 값만으로 전체 사용량을 측정할 수는 없다.

Stack 사용량을 살필 때는 먼저 알고 있는 Thread 주소와 현재 RSP가 같은 Kernel Page에 있는지 확인한다. 그 조건에서 `top - RSP`는 꼭대기부터 사용한 바이트 수이고, `RSP - (thread 주소 + sizeof(struct thread))`는 Thread 구조체 위에 남은 공간이다. User Stack이나 IRQ의 별도 Stack에 멈춘 상태에는 이 계산을 그대로 적용하지 않는다.

사용 가능 공간을 고정된 3 KiB나 3,896바이트로 잡지 않는다. `struct thread`의 크기는 빌드 옵션과 멤버에 따라 달라지고, `magic`도 그 구조체 안에 있어 `sizeof(struct thread)`에 이미 포함된다. `fd_table` 역시 이 버전에서는 별도 페이지를 가리키는 포인터다. 구조체 크기와 외부 자원의 크기를 한 페이지에서 모두 빼는 계산은 맞지 않는다. [현재 Thread 선언](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/include/threads/thread.h#L127-L161), [별도 FD Table 할당](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/process.c#L154)

RSP가 Thread 구조체 영역까지 내려오면 그 안의 상태를 훼손할 수 있다. 이 구현은 `magic`을 `THREAD_MAGIC`, 즉 `0xcd6abf4b`와 비교해 손상을 확인한다. 이 검사는 주소 접근 자체를 막는 Guard Page와 다르다. Linux의 `CONFIG_VMAP_STACK`은 지원하는 Architecture에서 Guard Page를 둔 Stack을 사용한다. [PintOS의 Magic 검사](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/thread.c#L20-L24), [Linux의 Stack과 Guard Page](https://docs.kernel.org/mm/vmalloced-kernel-stacks.html)

### TSS 갱신 전후를 비교할 때

`schedule()`은 실제 `thread_launch()` 전에 `process_activate(next)`를 호출한다. 이 함수는 다음 Page Table을 활성화한 뒤 TSS를 갱신한다. 따라서 전환 중간에는 아직 이전 Thread의 Stack에서 실행하면서 TSS는 다음 Thread를 가리킬 수 있다. 어느 명령에서 멈췄는지 확인하지 않고 두 값의 차이만으로 버그를 판단하면 정상적인 전환을 잘못 해석한다. [Scheduler의 순서](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/thread.c#L779-L809), [주소 공간과 TSS 활성화](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/process.c#L729-L733)

TSS를 갱신했다고 다음 Thread가 실행되는 것은 아니다. 실행 상태의 저장과 복원은 앞에서 살펴본 `thread_launch()`와 `do_iret()`가 맡는다. 이 PintOS의 전역 TSS 한 개를 쓰는 구성을 여러 CPU가 공유하는 설계로 그대로 확대해서는 안 된다. Linux는 CPU별 TSS와 진입 상태를 둔다.

다음 Thread를 실행할 때는 주소 공간과 커널 진입 Stack을 모두 그 Thread에 맞춰야 한다. 이전 프로세스의 Page Table이 남으면 사용자 주소가 이전 Mapping으로 해석될 수 있고, `rsp0`가 이전 Thread를 가리키면 이후 User→Kernel 진입 Frame이 그 Thread의 Kernel Stack에 쌓일 수 있다. 여기서 `next`와 `rsp0`는 Kernel 가상 주소다. CR3에 넣는 Page Table의 물리 주소와 구분해야 한다.

활성화는 스케줄링 외에도 새 주소 공간을 준비하는 도중에 일어난다. 현재 소스의 직접 호출 세 곳을 순서대로 읽으면 차이가 드러난다.

| 직접 호출 위치 | 활성화 전후의 순서 |
|---|---|
| `schedule()` | 다음 Thread 선택 → `THREAD_RUNNING` 표시·Tick 초기화 → `process_activate(next)` → 다른 Thread일 때 `thread_launch(next)` |
| `load()`의 `setup_process_address_space()` | PML4 생성 성공 → `process_activate(t)` → 명령행 복사·해석 → 파일 열기·ELF 확인·Segment와 초기 Stack 준비 |
| `__do_fork()` | 자식 PML4 생성 성공 → `process_activate(curr)` → SPT 또는 PTE 복제 → 파일 자원 복제 → 자식 Frame의 RAX를 0으로 설정하고 실행 준비 |

`load()`의 활성화는 ELF를 다 읽은 뒤가 아니라 파일을 열기 전이다. fork도 부모 Mapping을 모두 복제한 뒤 활성화하는 순서가 아니다. `process_exec()`는 이전 주소 공간을 정리한 뒤 `load()`를 호출하므로 이 활성화 경로를 간접적으로 거친다. 주소 공간을 활성화했다고 적재나 fork가 끝난 것은 아니다. 이후 준비가 실패하면 각 호출자의 오류 처리로 이어진다. [주소 공간 생성과 활성화](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/process.c#L915-L922), [load의 순서](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/process.c#L1106-L1149), [exec](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/process.c#L413-L473), [fork](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/process.c#L346-L394)

`next->pml4`가 NULL이면 `pml4_activate()`는 `base_pml4`를 선택한다. 이는 커널 전용 Thread뿐 아니라 exec에서 이전 주소 공간을 정리한 상태에도 나타나므로, NULL 하나로 Thread의 용도를 단정하지 않는다. 스케줄러의 `process_activate()` 호출은 `USERPROG` 빌드 조건 안에 있고 `curr != next` 검사보다 앞선다. 같은 Thread를 다시 선택해도 호출될 수 있다는 뜻이다. NULL 처리·`vtop()`·CR3 쓰기·정리 순서는 [Paging의 CR3 전환](/wiki/computer-systems-network-topic-dbd836d1a044/#cr3의-주소-필드와-전환-조건)에서 이어서 읽는다.

GDB에서는 `tss_update`의 `next`와 대입 전 `tss->rsp0`를 기록하고, 대입을 지난 뒤 새 값을 비교한다. 시스템 콜 진입에서는 현재 빌드의 Stack 교체 명령을 찾아 그 전후 RSP를 읽는다. 고정된 `syscall_entry+18`이나 명령 세 개라는 가정을 쓰기보다 `disassemble /r syscall_entry`로 실제 순서를 확인한다. `__do_fork()`는 자식 Thread에서 실행하므로 그 위치의 현재 Thread를 부모라고 기록해서도 안 된다.

`process_activate()`에 멈췄다면 먼저 `next->pml4`를 기록하고, 실제 `pml4_activate()` 호출 전후의 CR3를 비교한다. 비교 대상은 NULL일 때 선택하는 기본 테이블까지 고려한 물리 주소다. `schedule()`의 첫 명령에서는 지역 변수 `next`가 아직 정해지지 않았을 수 있으므로 소스의 대입 뒤나 실제 호출 위치에서 확인한다. TSS는 이 PintOS의 전역 `tss` 포인터로 읽는다. `GS Base + 4`를 `tss->rsp0`로 간주할 근거는 없으며, 현재 `syscall_entry`는 `$tss`의 주소에서 포인터를 역참조한다. [PML4 선택](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/threads/mmu.c#L221-L223), [실제 Stack 교체 명령](https://github.com/woonyong-kr/lrn-pintos/blob/9d1b14cbdf41425ba8867af743c03cf32190ee9b/pintos/userprog/syscall-entry.S#L6-L12)

인터럽트가 어디서 왔는지는 Handler 안의 현재 CS가 아니라 저장된 Frame의 CS로 확인한다. Ring 0 Handler에 도착한 뒤의 현재 CS만 보고 User에서 온 IRQ를 분류할 수는 없다. 이 관찰 절차는 새 GDB 실행 기록이 아니며, TSS와 예상 Stack이 다를 때도 중단 위치·포인터 계산·메모리 손상을 함께 조사해야 한다.

### Linux와 QEMU가 TSS를 사용하는 위치

Linux v6.12의 일반 x86-64 경로는 PintOS처럼 모든 Thread 전환에서 TSS의 `sp0`를 해당 Thread Stack으로 바꾼다고 설명할 수 없다. `__switch_to()`는 `pcpu_hot.top_of_stack`을 갱신하며, `update_task_stack()`에서 `load_sp0()`를 호출하는 64비트 분기는 FRED가 꺼진 Xen PV 조건에 있다. 기존 진입 경로의 일정한 진입용 Stack과 Thread Stack을 구분해야 한다. [Thread별 Stack 위치 갱신](https://github.com/torvalds/linux/blob/v6.12/arch/x86/kernel/process_64.c), [sp0와 Xen PV 조건](https://github.com/torvalds/linux/blob/v6.12/arch/x86/include/asm/switch_to.h#L60-L70)

Stack 배치도 PintOS의 한 페이지 모양을 그대로 대입하지 않는다. Linux v6.12의 x86은 `THREAD_INFO_IN_TASK`를 선택하고 `thread_info`를 `task_struct` 안에 둔다. Kernel Stack의 크기와 Guard 설정은 해당 빌드에서 확인한다. User Stack의 한도인 `RLIMIT_STACK`은 `getrlimit()`로 읽는 자원 제한이며, 적용되는 Soft Limit와 그 상한인 Hard Limit가 있다. 8 MiB를 모든 Linux 프로세스의 고정 최댓값으로 사용하지 않는다. [x86의 설정](https://github.com/torvalds/linux/blob/v6.12/arch/x86/Kconfig#L307), [task_struct의 thread_info](https://github.com/torvalds/linux/blob/v6.12/include/linux/sched.h#L732-L739), [Linux의 Stack 자원 제한](https://man7.org/linux/man-pages/man2/getrlimit.2.html)

QEMU v10.0.0의 `helper_ltr()`는 Guest GDT의 TSS Descriptor를 읽어 `env->tr`에 Base·Limit·속성을 넣고 GDT 쪽에 Busy Bit를 기록한다. `get_rsp_from_tss()`는 이 Base에 Offset을 더해 Guest 메모리에서 Stack Pointer를 읽는다. 권한 전환이면 해당 CPL의 RSP를, IST가 지정됐으면 해당 IST 칸을 사용한다. Base를 Guest 물리 주소나 Host 포인터로 해석하지 않는다. [TR 적재와 TSS 읽기](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/seg_helper.c)

CR3 쓰기와 TLB 무효화는 이 Stack 교체와 별개의 경로다. 무효화 범위에는 CPU 기능과 명령 조건이 관여하며, QEMU의 Software TLB와 Host CPU의 TLB도 같은 대상이 아니다. PCID·Global 변환에 따른 조건은 [CR3의 전환 조건](/wiki/computer-systems-network-topic-dbd836d1a044/#cr3의-주소-필드와-전환-조건), PintOS와 QEMU의 `cpu_x86_update_cr3()` 경로는 [Paging의 구현 비교](/wiki/computer-systems-network-topic-dbd836d1a044/#pintos의-세-경로를-구분한다)에서 확인한다.

이 TSS 접근은 Page Table의 주소 변환을 대신하지 않는다. 인터럽트의 Stack 선택과 저장 Frame은 [Interrupt](/wiki/computer-systems-network-topic-c19e34701c6c/#cpu와-assembly가-함께-만드는-frame)에서, SYSCALL 명령 뒤 PintOS가 직접 RSP를 바꾸는 과정은 [시스템 콜](/wiki/computer-systems-network-topic-3cc26725c1cb/#진입-주소에-도착해도-스택은-아직-사용자-것이다)에서 이어서 읽는다.

## 복귀 직전과 직후를 비교하기

GDB 절차는 디버그 심볼이 있는 PintOS Kernel과 QEMU에 연결한 환경에서 수행한다. 아래 명령은 관찰 방법이며 이 문서의 Python 실행 결과와 달리 실제 Kernel 실행 기록은 아니다.

```gdb
break *do_iret
continue
set $saved_tf = (struct intr_frame *)$rdi
p sizeof(struct intr_frame)
p/x $saved_tf->rip
p/x $saved_tf->cs
p/x $saved_tf->eflags
p/x $saved_tf->rsp
p/x $saved_tf->ss
p $saved_tf->R.rdi
p/x $saved_tf->R.rsi
p/x $saved_tf->R.rax
disassemble /r do_iret
```

함수의 첫 명령에 중단했다면 x86-64 C 호출 규약의 첫 인자는 RDI에 있다. `do_iret`는 Kernel Thread에도 쓰이므로 첫 중단이 곧 사용자 진입이라는 전제는 두지 않는다. 저장한 CS가 `0x23`인지 먼저 확인한다.

`disassemble /r` 출력에서 **현재 빌드의** `iretq` 위치를 찾아 그 주소에 임시 중단점을 두거나 `stepi`로 진행한다. `do_iret+87` 같은 고정 offset은 Compiler·옵션에 따라 달라질 수 있다. 아래 명령은 이미 `iretq` 직전에 중단한 상태에서 실행한다.

```gdb
x/i $rip
x/5gx $rsp
info registers rax rdi rsi
stepi
info registers rip cs eflags rsp ss
```

명령 직전의 `$rsp`는 복원할 User Stack이 아니라 Kernel 메모리의 RIP slot을 가리킨다. 그 위치에서 읽은 다섯 값과 명령 직후의 레지스터를 비교한다. CS·SS slot은 아래 16비트를 Selector로 읽으며 padding까지 Selector 값으로 해석하지 않는다. `stepi` 하나로 항상 `do_iret()` 전체를 지난다고 가정해서는 안 된다. 사용자 코드가 시작된 뒤에는 예외나 인터럽트가 바로 발생할 수도 있다.

복귀 실패도 발생 위치를 구분해 조사한다. 프레임 자체를 읽지 못했는지, Segment 검증이 실패했는지, 복귀 후 첫 명령어의 주소 변환에 실패했는지는 서로 다르다. CS의 RPL만 3으로 맞춘다고 충분하지 않으며 Descriptor의 종류·DPL·Present와 SS 관계도 맞아야 한다. 모든 실패를 `#GP(0)` 하나로 기록하지 않는다. [Intel IRET와 인터럽트 처리 규칙](https://www.intel.com/content/dam/www/public/us/en/documents/manuals/64-ia-32-architectures-software-developer-vol-3a-part-1-manual.pdf)

## Linux와 QEMU에서 비교할 지점

Linux v6.12의 `start_thread_common()`은 `pt_regs`에 새 IP·SP·Segment·Flag를 넣는다. x86-64의 `pt_regs`는 21개의 8바이트 slot, 168바이트이며 CS와 SS 영역에는 Union이 사용된다. PintOS의 192바이트 구조체와 필드 순서가 같지 않다. 또한 이 버전은 FRED 경로를 포함하므로 모든 시스템의 사용자 진입을 무조건 `iretq` 한 경로로 그리지 않는다. [Linux 실행 문맥 초기화](https://github.com/torvalds/linux/blob/v6.12/arch/x86/kernel/process_64.c), [pt_regs](https://github.com/torvalds/linux/blob/v6.12/arch/x86/include/asm/ptrace.h)

전통적인 x86-64 시스템 콜 경로의 `do_syscall_64()`는 RCX와 IP, R11과 Flag의 일치, CS·SS, 사용자 IP 범위, RF·TF와 Xen PV 여부를 확인해 SYSRET 가능 여부를 반환한다. AC나 Signal 존재 여부만으로 두 경로를 나누는 흐름도는 이 구현의 최종 조건을 나타내지 못한다. `ptrace`를 사용했다는 사실만으로 결론 내리는 대신 복귀 직전의 저장 상태와 조건식을 확인한다. [Linux v6.12 반환 조건](https://github.com/torvalds/linux/blob/v6.12/arch/x86/entry/common.c)

`entry_64.S`는 이 결과에 따라 SYSRET 경로 또는 사용자 레지스터를 복원하는 경로로 이동한다. `ret_from_fork_asm`에도 기존 IRET 경로와 FRED 대체 경로가 구분돼 있다. NMI·IST나 Signal 처리까지 비교할 때는 해당 진입점과 Kernel 설정을 더 읽어야 한다. 두 복귀 명령의 비용도 CPU와 완화 옵션에 따라 달라지므로 측정 없이 고정 Cycle 차이나 성능 향상을 적지 않는다. [Linux x86-64 진입 Assembly](https://github.com/torvalds/linux/blob/v6.12/arch/x86/entry/entry_64.S)

Linux v6.12의 x86-64 GDT는 `GDT_ENTRIES=16`이며 `__KERNEL_CS=0x10`, `__USER_CS=0x33`이다. Code·Data의 권한을 나누는 원리는 같지만 Descriptor의 배치와 Selector 값은 비교하는 커널의 선언을 확인해야 한다. 전통적인 syscall 진입점 `entry_SYSCALL_64`도 이 버전의 FRED 설정과 함께 확인해야 한다. [Linux의 64비트 Segment 정의](https://github.com/torvalds/linux/blob/v6.12/arch/x86/include/asm/segment.h#L169-L217), [진입과 Dispatch 비교](/wiki/computer-systems-network-topic-3cc26725c1cb/#dispatch-방식은-구현과-버전으로-확인한다)

Linux의 KPTI는 켜진 환경에서 User용 Page Table과 Kernel용 Page Table을 전환하고, User 쪽에는 진입·복귀에 필요한 최소 Kernel Mapping을 남긴다. Kernel Mapping을 전부 없애거나 U/S 권한 검사를 대체하는 기능이 아니다. Windows의 KVA Shadow도 진입용 Mapping과 Stack을 따로 고려한다. 이런 보호 기능의 활성화 여부를 OS 이름만으로 단정하지 않는다. [Linux v6.12 PTI](https://docs.kernel.org/6.12/arch/x86/pti.html), [Microsoft의 KVA Shadow 설계 설명](https://www.microsoft.com/en-us/msrc/blog/2018/03/kva-shadow-mitigating-meltdown-on-windows)

Windows에서도 커널 무결성 검사와 메모리 격리는 서로 다른 기능이 맡는다. Microsoft가 설명하는 Kernel Patch Protection(PatchGuard)은 허용되지 않은 변경으로부터 Kernel 코드와 중요 구조체를 보호하는 기능이다. VBS를 위한 Virtual Secure Mode는 Hypervisor가 격리 영역에 별도 메모리 접근 경계를 두어 일반 Kernel 권한의 코드도 그 경계 밖에서 접근하지 못하게 하는 기반이다. `KiSystemCall64`나 SSDT(System Service Descriptor Table)로 특정 Windows의 진입·분기를 비교하려면 대상 빌드와 심볼부터 고정해야 하며, 여기서는 현행 모든 Windows의 공통 구현으로 단정하지 않는다. [Microsoft의 Kernel Patch Protection 설명](https://learn.microsoft.com/en-us/security-updates/securityadvisories/2007/932596), [Virtual Secure Mode의 경계](https://learn.microsoft.com/en-us/virtualization/hyper-v-on-windows/tlfs/vsm)

QEMU v10.0.0의 TCG에서는 `gen_IRET()`가 실행 모드에 따라 Helper를 고르고 현재 Translation Block을 끝내도록 표시한다. PintOS의 64비트 보호 모드 경로는 `helper_iret_protected()`이며, `helper_iret_real()`은 Real Mode·VM86 쪽이다. 분기는 `translate.c`라는 이름만 찾기보다 실제 `emit.c.inc`까지 확인해야 한다. [TCG의 IRET 변환](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/emit.c.inc)

보호 모드 Helper는 Guest Stack에서 값을 읽고 Descriptor를 검사한 뒤 `CPUX86State`의 `eip`, `regs[R_ESP]`, Segment 상태와 Flag를 갱신한다. 64비트 IRET에는 같은 CPL에서도 SS:RSP를 읽는 분기가 적용된다. 그 경로에서 `validate_seg()`는 ES·DS·FS·GS의 접근 조건도 재검사한다. 모든 Segment Cache를 무조건 비우는 것은 아니며 NULL FS·GS를 별도로 다루는 분기도 있다. Flag 복원 Mask는 복귀 전 CPL과 IOPL 등을 기준으로 정하므로 저장된 RFLAGS의 모든 비트가 그대로 대입된다고 설명하지 않는다.

이후 새 실행 상태에 맞는 TB를 찾으며, 이미 번역된 TB를 재사용할 수도 있다. 복귀할 때마다 새 TB를 반드시 생성한다는 뜻은 아니다. 이 구현은 Guest CPU 상태를 다루므로 Guest RIP와 Host의 명령어 주소도 구분한다. [QEMU IRET Helper](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/seg_helper.c)

### QEMU에서 권한 검사를 찾는 순서

QEMU v10.0.0의 TCG는 TB flags에서 CPL·IOPL을 꺼내 `DisasContext`에 보관한다. `decode-new.c.inc`는 `MOV_CR_DR`·`WRMSR`·`HLT` 등에 `chk(cpl0)`를, `CLI/STI`에는 `chk(iopl)`를 붙이고, 변환 중 조건이 맞지 않으면 `gen_exception_gpf()` 경로를 만든다. [TB 상태 구성](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/translate.c#L3699-L3718), [명령별 권한 조건과 분기](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/decode-new.c.inc#L2799-L2820)

Port I/O는 별도 경로를 따른다. `emit.c.inc`의 `gen_IN()`·`gen_INS()`·`gen_OUT()`·`gen_OUTS()`가 `translate.c`의 `gen_check_io()`를 사용한다. System build에서 CPL > IOPL 등으로 bitmap 검사가 필요하면 `gen_helper_check_io()` 호출을 생성한다. 실제 `helper_check_io()`는 `tcg/system/seg_helper.c`에서 TR의 Base·Limit, TSS의 `iomb`, 접근할 Port와 크기를 읽어 판정한다. TSS 초기화가 적절한지 확인할 때도 이 조건과 앞의 PintOS 설정을 대조한다. [Port I/O의 호출 경로](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/emit.c.inc), [I/O 검사 생성](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/translate.c#L802-L830), [TSS Bitmap 검사](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/system/seg_helper.c#L227-L253)

이 설명은 QEMU TCG의 System Emulation 경로다. Guest의 `#GP` 전달·Page Table 권한·TSS 읽기와, 그 결과를 받아 Thread를 종료하거나 VM Page를 복구하는 PintOS의 정책을 나누어 읽는다. KVM 같은 가속기와 User Emulation에 같은 Helper 호출을 그대로 적용하지 않는다. 디버깅할 때는 현재 CS와 저장된 CS를 먼저 구별하고, 그다음 명령의 권한 조건 또는 Page Fault 오류 코드에 해당하는 소스 분기를 찾는다.
