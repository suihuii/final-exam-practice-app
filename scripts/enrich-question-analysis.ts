import fs from "node:fs";
import path from "node:path";
import type { Course, Question } from "../src/types";

interface CourseAnalysisReport {
  courseId: string;
  courseName: string;
  kept: number;
  updated: number;
}

interface AnalysisContext {
  answerText: string;
  matchText: string;
}

interface AnalysisParts {
  thinking: string;
  key: string;
  mistake?: string;
}

interface TopicRule {
  name: string;
  matches: (question: Question, context: AnalysisContext) => boolean;
  build: (question: Question, context: AnalysisContext) => AnalysisParts;
}

const professionalCourseIds = new Set(["power-supply", "power-plant"]);
const lowQualityPhrases = [
  "标准答案为",
  "标准答案是",
  "对应选项内容",
  "本题是单选题",
  "本题是多选题",
  "本题是判断题",
  "本题为判断题",
  "题干关键点是",
  "判断时先抓住题干中的限定词",
  "复习时要找出其中过于绝对",
  "暂无可靠解析",
];

function run(): void {
  const coursesPath = path.resolve("src/data/courses.json");
  const courses = JSON.parse(stripBom(fs.readFileSync(coursesPath, "utf8"))) as Course[];
  const reports: CourseAnalysisReport[] = [];
  const professionalQuestions = new Map<string, Question[]>();

  for (const course of courses) {
    const questionPath = path.resolve("src/data", course.questionFile);
    const questions = JSON.parse(stripBom(fs.readFileSync(questionPath, "utf8"))) as Question[];
    let kept = 0;
    let updated = 0;

    const enriched = questions.map((question) => {
      if (!professionalCourseIds.has(course.id) && question.analysis.trim()) {
        kept += 1;
        return question;
      }

      if (shouldKeepExistingAnalysis(question.analysis)) {
        kept += 1;
        return question;
      }

      updated += 1;
      return {
        ...question,
        analysis: buildAnalysis(course, question),
      } satisfies Question;
    });

    fs.writeFileSync(questionPath, `${JSON.stringify(enriched, null, 2)}\n`, "utf8");
    reports.push({ courseId: course.id, courseName: course.name, kept, updated });

    if (professionalCourseIds.has(course.id)) {
      professionalQuestions.set(course.id, enriched);
    }
  }

  console.log("解析/答题思路补充结果:");
  for (const report of reports) {
    console.log(`${report.courseName}(${report.courseId}): 保留 ${report.kept} 题，生成/更新 ${report.updated} 题。`);
  }

  printLowQualityReport(professionalQuestions);
}

function buildAnalysis(course: Course, question: Question): string {
  if (professionalCourseIds.has(course.id)) {
    return formatAnalysis(buildProfessionalAnalysis(question) ?? buildGenericProfessionalAnalysis(question));
  }

  return formatAnalysis(buildAestheticAnalysis(question));
}

function buildProfessionalAnalysis(question: Question): AnalysisParts | null {
  const context = buildContext(question);
  const rule = topicRules.find((item) => item.matches(question, context));
  return rule?.build(question, context) ?? null;
}

const topicRules: TopicRule[] = [
  {
    name: "ct-pt-comparison",
    matches: (_question, context) => hasAll(context, ["电流互感器", "电压互感器"]) && hasAny(context, ["区别", "比较", "相反"]),
    build: () => ({
      thinking:
        "电流互感器一次侧串联、二次侧接近短路运行；电压互感器一次侧并联、二次侧接近开路运行。两者都把一次侧高电压或大电流转换成仪表和保护可用的二次量，但运行禁忌正好相反。",
      key: "CT 禁止二次开路，PT 禁止二次短路。",
      mistake: "不要把 CT 和 PT 的二次侧运行状态混记。",
    }),
  },
  {
    name: "current-transformer",
    matches: (_question, context) => hasAny(context, ["电流互感器", "ct"]),
    build: (_question, context) => {
      if (hasAny(context, ["开路", "高电压", "互相连接", "二次侧不允许"])) {
        return {
          thinking:
            "电流互感器一次侧串联在被测回路中，二次侧接近短路运行。二次侧开路时磁通会急剧增大，在二次绕组感应出高电压，危及人身和设备安全，并可能烧毁绝缘。",
          key: "电流互感器运行中严禁二次开路。",
          mistake: "CT 禁止开路，不是禁止短路；和 PT 的禁忌相反。",
        };
      }
      return {
        thinking:
          "电流互感器用于把一次回路的大电流转换成二次侧标准小电流，便于测量、计量和保护。它一次侧串联在被测电路中，二次侧工作状态接近短路。",
        key: "CT 串联取电流，二次侧严禁开路。",
        mistake: "互感器虽连接一次和二次系统，但运行禁忌要按 CT、PT 分开记。",
      };
    },
  },
  {
    name: "voltage-transformer",
    matches: (_question, context) => hasAny(context, ["电压互感器", "pt"]),
    build: (_question, context) => {
      if (hasAny(context, ["不允许开路", "严禁开路", "二次侧开路", "二次开路"])) {
        return {
          thinking:
            "电压互感器二次侧接近开路运行，正常情况下允许开路，但严禁短路；二次短路会产生大电流并可能熔断熔断器或损坏设备。电流互感器才是二次侧严禁开路。",
          key: "PT 禁止短路，CT 禁止开路。",
          mistake: "看到“二次侧不允许开路”要先判断说的是 CT 还是 PT。",
        };
      }
      if (hasAny(context, ["短路", "熔断器", "损坏设备"])) {
        return {
          thinking:
            "电压互感器一次侧并联在被测回路中，二次侧接近开路运行。二次侧短路会使回路电流异常增大，轻则熔断熔断器，重则损坏互感器或二次设备。",
          key: "电压互感器运行中严禁二次短路。",
          mistake: "PT 禁止短路，不是禁止开路；CT 才禁止开路。",
        };
      }
      return {
        thinking:
          "电压互感器一次侧并联在被测电路中，把高电压变换成二次侧标准低电压，供测量、保护和同期使用。它的二次侧接近开路运行。",
        key: "PT 并联取电压，二次侧严禁短路。",
        mistake: "PT 与 CT 的接线方式和二次侧禁忌正好相反。",
      };
    },
  },
  {
    name: "isolation-switch",
    matches: (_question, context) => hasAny(context, ["隔离开关", "刀闸", "gw5", "gn19"]),
    build: (_question, context) => {
      if (hasAny(context, ["带负荷", "负荷操作", "灭弧", "切断负荷", "切断短路"])) {
        return {
          thinking:
            "隔离开关主要用于隔离电源、形成明显断开点和小电流回路操作，本身没有专门灭弧能力。带负荷分合会产生电弧，不能可靠开断负荷电流，所以应先由断路器切除负荷后再操作隔离开关。",
          key: "隔离开关无灭弧能力，不能带负荷分合闸。",
          mistake: "断路器可以开断负荷电流和短路电流，隔离开关不能替代断路器。",
        };
      }
      if (hasAny(context, ["先合后断", "分闸", "合闸", "操作原则", "断路器切断"])) {
        return {
          thinking:
            "隔离开关与断路器配合操作时，必须避免隔离开关承担负荷电流。接通时先合隔离开关再合断路器，断开时先分断路器再拉隔离开关，核心都是让断路器负责带负荷开断。",
          key: "倒闸顺序围绕“隔离开关不带负荷”来判断。",
          mistake: "不要只背先后顺序，要看当时电流由谁开断。",
        };
      }
      if (hasAny(context, ["运动方式", "水平旋转", "垂直旋转", "插入式"])) {
        return {
          thinking:
            "隔离开关可按刀闸运动方式分类，常见形式包括水平旋转式、垂直旋转式和插入式。题干列出其中两类时，应从这组结构分类中补全。",
          key: "刀闸运动方式按“水平旋转、垂直旋转、插入式”成组记忆。",
        };
      }
      if (hasAny(context, ["gw5-35", "35kv", "电压等级"])) {
        return {
          thinking:
            "隔离开关型号中的数字通常反映额定电压等级。GW5-35 系列对应 35kV 电力系统，判断时把型号数字和适用电压等级对应起来。",
          key: "GW5-35 中的 35 对应 35kV 电压等级。",
          mistake: "不要把型号序号和额定电压混在一起。",
        };
      }
      return {
        thinking:
          "隔离开关用于隔离电源、形成明显断开点和配合倒闸操作，也可在规定条件下操作小电流回路。由于没有专门灭弧能力，涉及负荷或故障电流时必须让断路器承担开断任务。",
        key: "隔离开关管“隔离和小电流”，不管“故障切除”。",
        mistake: "看到隔离开关和断路器同时出现时，先分清隔离与开断两类职责。",
      };
    },
  },
  {
    name: "vacuum-breaker",
    matches: (_question, context) => hasAny(context, ["真空断路器", "真空灭弧", "真空度", "截流", "重燃"]),
    build: (_question, context) => {
      if (hasAny(context, ["过电压", "截流", "重燃", "感性负载", "容性负载"])) {
        return {
          thinking:
            "真空断路器以真空作为灭弧和绝缘介质，适合中压系统。开断感性或容性负载时，电流可能被提前截断或出现重燃，从而引起操作过电压。",
          key: "真空断路器开断感性、容性负载时要注意截流和重燃过电压。",
          mistake: "过电压不一定来自机构故障，真空灭弧特性本身也可能引起。",
        };
      }
      return {
        thinking:
          "真空断路器利用真空灭弧室熄灭电弧，结构紧凑、维护量小，常用于 35kV 及以下中压配电系统。真空度会影响灭弧室绝缘恢复和开断能力。",
        key: "真空断路器的灭弧介质是真空。",
        mistake: "不要把真空断路器与油断路器、SF6 断路器的灭弧介质混记。",
      };
    },
  },
  {
    name: "sf6",
    matches: (_question, context) => hasAny(context, ["sf6", "sf₆", "六氟化硫"]),
    build: () => ({
      thinking:
        "SF6 是无色无味气体，绝缘性能和灭弧性能都很好，因此常用于高压断路器和气体绝缘设备。它本身较稳定，但在电弧作用下可能分解出有毒、腐蚀性产物，检修时不能忽视安全处理。",
      key: "SF6 记住“无色无味、绝缘灭弧好”。",
      mistake: "SF6 本身稳定，不代表电弧分解物没有危害。",
    }),
  },
  {
    name: "switchgear-five-prevention",
    matches: (_question, context) => hasAny(context, ["高压开关柜", "开关柜", "高压成套装置", "kyn", "五防", "手车", "小车", "带电间隔"]),
    build: (_question, context) => {
      if (hasAny(context, ["五防", "误入", "联锁", "接地开关", "带电间隔", "带负荷推拉"])) {
        return {
          thinking:
            "高压开关柜除接受和分配电能外，还承担控制、保护、测量和安全闭锁功能。“五防”核心是防误操作，如防止带负荷推拉手车、防止带电合接地开关、防止误入带电间隔等。",
          key: "五防考的是防误操作，不是普通设备故障。",
          mistake: "设备老化、接触发热不属于“五防”联锁的典型内容。",
        };
      }
      if (hasAny(context, ["手车", "小车", "二次插头", "试验", "隔离位置", "工作位置", "摇把"])) {
        return {
          thinking:
            "手车式高压开关柜通过工作位置、试验/隔离位置等状态实现安全操作和检修隔离。二次插头、手车推进退出等操作必须满足位置闭锁要求，避免带电或带负荷误操作。",
          key: "手车柜操作先看位置，试验/隔离位置是检修和插拔二次回路的安全位置。",
          mistake: "不要把工作位置当成可随意插拔或检修的位置。",
        };
      }
      return {
        thinking:
          "高压开关柜是成套配电装置，用于接受和分配电能，并对电路进行控制、保护、测量和监视。选择功能单元时要服从电气主接线和运行安全要求。",
        key: "高压开关柜 = 配电 + 控制保护 + 安全闭锁。",
      };
    },
  },
  {
    name: "power-capacitor",
    matches: (_question, context) => hasAny(context, ["电容器", "并联电容", "串联电容", "无功补偿", "功率因数"]),
    build: (_question, context) => {
      if (hasAny(context, ["最大电流", "额定电流", "立即停运", "1.3"])) {
        return {
          thinking:
            "电容器长期过电流会导致介质发热和绝缘老化，严重时可能鼓肚或损坏。高压电容器运行电流一般不应超过额定电流的规定上限，本题考查停运限值，超过 1.3 倍额定电流应立即停运。",
          key: "高压电容器最大运行电流超过 1.3 倍额定电流要停运。",
          mistake: "不要只记数字，要把 1.3 倍和过电流发热、绝缘老化风险联系起来。",
        };
      }
      if (hasAny(context, ["功率因数", "无功补偿", "主要目的"])) {
        return {
          thinking:
            "电力电容器主要提供容性无功，用来补偿感性负荷消耗的无功功率。补偿后线路电流和无功交换减少，功率因数提高。",
          key: "并联电容器最常见作用是无功补偿、提高功率因数。",
          mistake: "电容器不能直接增加变压器额定容量，它是改善无功和电压状况。",
        };
      }
      return {
        thinking:
          "电力电容器用于提供容性无功，常见目标是无功补偿、改善电压和提高功率因数。运行中要特别关注过电流、过电压和放电安全。",
        key: "电容器围绕“无功补偿”和“过电流发热风险”记忆。",
      };
    },
  },
  {
    name: "reactor",
    matches: (_question, context) => hasAny(context, ["电抗器", "限流电抗", "并联电抗"]),
    build: (_question, context) => {
      if (hasAny(context, ["限流", "短路电流", "电压损失"])) {
        return {
          thinking:
            "限流电抗器串联在回路中，用增加电抗的方式限制短路电流。正常运行时它也会产生电压损失，所以为了保证供电质量，电压损失百分值必须控制在较小范围内。",
          key: "限流电抗器限制短路电流，正常运行电压损失一般按 5%（0.05）控制。",
          mistake: "限流电抗器不是无代价设备，正常运行也会带来电压降。",
        };
      }
      return {
        thinking:
          "并联电抗器常接在线路或母线上，用来吸收线路电容产生的容性无功，限制轻载或空载时的工频过电压，并改善电压分布。限流电抗器则主要用于限制短路电流。",
        key: "并联电抗器吸收容性无功，限流电抗器限制短路电流。",
        mistake: "限流电抗器和并联电抗器名称相近，但作用不同。",
      };
    },
  },
  {
    name: "bus-main-wiring",
    matches: (_question, context) => hasAny(context, ["母线", "主接线", "一个半断路器", "旁路母线", "单母线", "接线图"]),
    build: (_question, context) => {
      if (hasAny(context, ["单母线分段", "分段接线"])) {
        return {
          thinking:
            "单母线分段把一组母线分成若干段，各段通过分段断路器联系。某一段故障或检修时，可把停电影响限制在该段范围内，从而提高供电可靠性。",
          key: "单母线分段的价值是限制故障停电范围。",
          mistake: "不要只记图形，要分析故障或检修时哪些回路会停电。",
        };
      }
      if (hasAny(context, ["一个半断路器", "一台半断路器"])) {
        return {
          thinking:
            "一个半断路器接线通常每两回线路共用三台断路器，平均每回路占一台半断路器。它可靠性高、运行灵活，但接线、保护和操作都更复杂，投资也更高。",
          key: "一个半断路器接线可靠灵活，但复杂且投资高。",
          mistake: "不要只看断路器数量，要理解检修时回路是否仍能运行。",
        };
      }
      return {
        thinking:
          "母线接线方式影响供电可靠性、检修灵活性和投资成本。分析这类题时，要从故障范围、检修是否停电、断路器数量和保护复杂度一起判断。",
        key: "母线接线题要围绕可靠性、灵活性和停电范围理解。",
      };
    },
  },
  {
    name: "primary-secondary-equipment",
    matches: (_question, context) => hasAny(context, ["一次设备", "二次设备", "一次系统", "二次系统"]),
    build: () => ({
      thinking:
        "一次设备直接参与电能的生产、变换、输送和分配，通常位于主电路中；二次设备用于测量、控制、保护、监视和信号。互感器把高电压、大电流转换成二次设备可用的低电压、小电流，是一次系统和二次系统之间的接口。",
      key: "一次设备传输电能，二次设备服务测量控制保护。",
      mistake: "互感器容易混淆：它接入一次系统，但服务于二次测量和保护。",
    }),
  },
  {
    name: "safety-distance",
    matches: (_question, context) => hasAny(context, ["安全距离", "安全净距", "带电部分", "接地部分"]),
    build: (_question, context) => ({
      thinking: hasAny(context, ["220kv", "110kv"])
        ? "安全距离用于保证人体和设备不发生放电、触电或误碰。电压等级越高，所需安全距离越大；220kV 和 110kV 设备安全距离分别按 3m 和 1.5m 记忆。"
        : "安全距离是带电体、接地体、人体和设备之间为防止放电或误碰所需的最小距离。电压等级越高，空气绝缘要求越高，安全净距也越大。",
      key: hasAny(context, ["220kv", "110kv"]) ? "220kV 记 3m，110kV 记 1.5m。" : "安全距离随电压等级升高而增大。",
      mistake: "不要把不同电压等级、不同对象之间的安全距离混记。",
    }),
  },
  {
    name: "circuit-breaker",
    matches: (_question, context) => hasAny(context, ["断路器", "开断电流", "操动机构", "灭弧介质"]),
    build: (_question, context) => {
      if (hasAny(context, ["控制作用", "保护作用", "电网中主要"])) {
        return {
          thinking:
            "断路器既能在正常运行时通断负荷电流，也能在继电保护配合下切除短路电流。高压断路器在电网中主要承担控制和保护两类作用。",
          key: "高压断路器 = 控制正常回路 + 保护切除故障。",
          mistake: "不要把断路器只理解成普通开关，它还承担故障切除。",
        };
      }
      if (hasAny(context, ["操动机构", "分、合闸", "储能"])) {
        return {
          thinking:
            "断路器的分闸、合闸动作由操动机构完成，弹簧、液压、电磁等机构负责储能和释放能量。开断元件负责灭弧，操动机构负责动作执行。",
          key: "操动机构管分合闸动作，开断元件管灭弧。",
        };
      }
      return {
        thinking:
          "断路器用于正常负荷电流的通断，也能在保护装置配合下开断短路电流。判断断路器题时，要同时看控制作用、保护作用和灭弧能力。",
        key: "断路器能带负荷和故障电流开断。",
        mistake: "隔离开关只能隔离和小电流操作，不能替代断路器。",
      };
    },
  },
  {
    name: "oil-breaker",
    matches: (_question, context) => hasAny(context, ["油断路器", "多油断路器", "少油断路器", "绝缘油"]),
    build: (_question, context) => {
      if (hasAny(context, ["多油", "绝缘油主要作用"])) {
        return {
          thinking:
            "多油断路器中的绝缘油既用于灭弧，也承担相间和对地的主要绝缘作用。少油断路器则主要利用油灭弧，外部绝缘更多依靠空气、瓷套和有机绝缘材料。",
          key: "多油断路器的油兼作灭弧介质和主要绝缘介质。",
        };
      }
      return {
        thinking:
          "油断路器利用绝缘油灭弧，按油量和绝缘承担方式可分为多油、少油等类型。复习时要把灭弧介质和相间、对地绝缘介质分开判断。",
        key: "油断路器题先问清：油是只灭弧，还是也作主要绝缘。",
      };
    },
  },
];
function buildGenericProfessionalAnalysis(question: Question): AnalysisParts {
  if (question.type === "judge") {
    return {
      thinking:
        "本题考查概念或运行要求的判断。复习时应先确定题干说的是设备用途、接线方式、运行限制还是安全要求，再与教材定义对照，找出判断成立或不成立的依据。",
      key: "判断题要说明为什么对或错，不要只记结论。",
    };
  }

  if (question.type === "blank") {
    return {
      thinking:
        "本题考查定义或简答要点。作答时先给出核心概念，再补充用途、适用场景和必要的安全限制，避免只列孤立名词。",
      key: "简答题按“定义-作用-注意事项”组织更稳。",
    };
  }

  return {
    thinking:
      "本题考查概念辨析。复习时应把该设备或术语的用途、运行限制和安全要求放在一起记忆，先判断题干问的是作用、结构、接线方式还是运行条件。",
    key: "掌握定义和适用场景比单独记答案更可靠。",
  };
}

function buildAestheticAnalysis(question: Question): AnalysisParts {
  if (question.type === "judge") {
    return {
      thinking:
        "本题考查美育概念理解。判断时应回到课程中对审美、艺术、文化和人格培养关系的基本表述，确认题干是否扩大、缩小或偷换了概念范围。",
      key: "美育题重在理解概念关系，不要只背字面结论。",
    };
  }

  return {
    thinking:
      "本题考查课程概念辨析。复习时应把概念的含义、适用范围和与相近概念的区别放在一起理解，避免只记选项文字。",
    key: "先理解概念，再记典型表述。",
  };
}

function buildContext(question: Question): AnalysisContext {
  const labels = question.type === "single" || question.type === "multiple" ? answerLabels(question.answer) : [];
  const correctOptions = labels.length > 0 ? question.options.filter((option) => labels.includes(option.label)).map((option) => option.text) : [];
  const answerText = correctOptions.length > 0 ? correctOptions.join("、") : Array.isArray(question.answer) ? question.answer.join("、") : normalizeAnswer(question.answer);
  const searchText = [question.stem, ...question.options.map((option) => option.text), answerText].join(" ");

  return {
    answerText,
    matchText: normalizeForMatch(searchText),
  };
}

function formatAnalysis(parts: AnalysisParts): string {
  return [
    "答题思路：",
    parts.thinking,
    "关键点：",
    parts.key,
    parts.mistake ? "易错点：" : "",
    parts.mistake ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}

function shouldKeepExistingAnalysis(value: string | undefined): boolean {
  const text = value?.trim() ?? "";
  if (text.length < 8 || /^p\d+(\s*-\s*p?\d+)?$/i.test(text)) {
    return false;
  }
  return !lowQualityPhrases.some((phrase) => text.includes(phrase));
}

function printLowQualityReport(questionMap: Map<string, Question[]>): void {
  const hits: string[] = [];

  for (const [courseId, questions] of questionMap) {
    for (const phrase of lowQualityPhrases) {
      let total = 0;
      const examples: string[] = [];
      for (const question of questions) {
        const count = countOccurrences(question.analysis, phrase);
        if (count === 0) {
          continue;
        }
        total += count;
        if (examples.length < 3) {
          examples.push(`${question.id}: ${question.stem}`);
        }
      }
      if (total > 0) {
        hits.push(`${courseId} "${phrase}" 出现 ${total} 次。示例：${examples.join("；")}`);
      }
    }
  }

  console.log("低质量模板检查:");
  if (hits.length === 0) {
    console.log("供配电系统、发电厂题库未发现低质量模板短语。");
    return;
  }

  hits.forEach((hit) => console.warn(hit));
}

function countOccurrences(text: string, phrase: string): number {
  return text.split(phrase).length - 1;
}

function answerLabels(answer: Question["answer"]): string[] {
  const text = Array.isArray(answer) ? answer.join("") : answer;
  return Array.from(new Set(text.toUpperCase().match(/[A-H]/g) ?? [])).sort();
}

function normalizeAnswer(answer: Question["answer"]): string {
  const text = (Array.isArray(answer) ? answer.join("、") : answer).trim();
  const lower = text.toLowerCase();
  if (["正确", "对", "true", "t", "yes", "y", "√", "✓"].includes(lower)) {
    return "正确";
  }
  if (["错误", "错", "false", "f", "no", "n", "×", "x"].includes(lower)) {
    return "错误";
  }
  return text;
}

function hasAny(context: AnalysisContext, fragments: string[]): boolean {
  return fragments.some((fragment) => context.matchText.includes(normalizeForMatch(fragment)));
}

function hasAll(context: AnalysisContext, fragments: string[]): boolean {
  return fragments.every((fragment) => context.matchText.includes(normalizeForMatch(fragment)));
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/sf₆/g, "sf6")
    .replace(/[（）()，。；;：:、？?！!《》“”"'\[\]\s]/g, "");
}

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "");
}

run();
