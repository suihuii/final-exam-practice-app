import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { decode as decodeEntities } from "html-entities";
import type { Course, Question, QuestionOption } from "../src/types";

interface ZipEntry {
  compressedSize: number;
  localHeaderOffset: number;
  method: number;
  name: string;
}

interface ChoiceDraft {
  image?: string;
  imageAlt?: string;
  number: number;
  options: QuestionOption[];
  stem: string;
}

interface SubjectiveDraft {
  answer: string[];
  analysis: string;
  image?: string;
  imageAlt?: string;
  stem: string;
}

const COURSE_ID = "construction-management";
const COURSE: Course = {
  id: COURSE_ID,
  name: "建设工程项目管理",
  shortName: "建工管理",
  description: "建设工程项目管理期末复习题库",
  questionFile: "questions/construction-management.json",
};

const inputDir = path.resolve("raw/construction-management");
const choiceDocxPath = path.join(inputDir, "选择题题库.docx");
const subjectivePdfPath = path.join(inputDir, "期末考试主观题题库.pdf");
const outputPath = path.resolve("src/data/questions/construction-management.json");
const coursesPath = path.resolve("src/data/courses.json");
const imageDir = path.resolve("public/question-images");

const choiceNetworkImage = "question-images/construction-management-q0040-network.png";
const subjectiveNetworkDataImage = "question-images/construction-management-q0021-network-data.png";
const subjectiveNetworkAnswerImage = "question-images/construction-management-q0021-answer-reference.png";

main();

function main() {
  assertFileExists(choiceDocxPath);
  assertFileExists(subjectivePdfPath);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.mkdirSync(imageDir, { recursive: true });

  extractDocxNetworkImage();
  const pdfImageReport = extractPdfNetworkImages();

  const choiceQuestions = parseChoiceQuestions();
  const subjectiveQuestions = parseSubjectiveQuestions(choiceQuestions.length);
  const questions = [...choiceQuestions, ...subjectiveQuestions];

  fs.writeFileSync(outputPath, `${JSON.stringify(questions, null, 2)}\n`, "utf8");
  ensureCourse();

  const counts = countTypes(questions);
  console.log(`课程: ${COURSE.name}(${COURSE.id})`);
  console.log(`题库文件: ${path.relative(process.cwd(), outputPath)}`);
  console.log(`单选数量: ${counts.single}`);
  console.log(`多选数量: ${counts.multiple}`);
  console.log(`判断数量: ${counts.judge}`);
  console.log(`填空/主观数量: ${counts.blank}`);
  console.log(`总题数: ${questions.length}`);
  console.log("图片处理:");
  console.log(`- DOCX 第 40 题网络图: ${choiceNetworkImage}`);
  console.log(`- PDF 第 20 题数据图: ${subjectiveNetworkDataImage}`);
  console.log(`- PDF 第 20 题答案参考图: ${subjectiveNetworkAnswerImage}（保留为参考，不绑定到题目，避免提前暴露答案）`);
  for (const item of pdfImageReport) {
    console.log(`  ${item}`);
  }
  console.log("暂无法准确重绘的图片:");
  console.log("- DOCX 第 40 题网络图：已保留原图，未在脚本中重绘。");
  console.log("- PDF 第 20 题数据/答案图：已提取原图；答案图未绑定到题目，具体六时标数值需人工复核后再重绘。");
}

function parseChoiceQuestions(): Question[] {
  const buffer = fs.readFileSync(choiceDocxPath);
  const documentXml = readZipEntry(buffer, "word/document.xml").toString("utf8");
  const text = docxXmlToText(documentXml);
  const answerStart = text.search(/\n\s*1\s*-\s*10\s+/);

  if (answerStart < 0) {
    throw new Error("选择题题库.docx 中未找到 1-10 开头的答案表。");
  }

  const questionText = text.slice(0, answerStart);
  const answerText = text.slice(answerStart);
  const answers = parseChoiceAnswerTable(answerText);
  const drafts = splitChoiceBlocks(questionText);

  if (drafts.length !== 90) {
    throw new Error(`选择题解析数量应为 90，实际为 ${drafts.length}。`);
  }

  const missingAnswers = drafts.filter((draft) => !answers.has(draft.number)).map((draft) => draft.number);
  if (missingAnswers.length > 0) {
    throw new Error(`选择题答案表缺少题号: ${missingAnswers.join(", ")}`);
  }

  return drafts.map((draft, index) => {
    const answer = answers.get(draft.number) ?? "";
    const selected = draft.options.find((option) => option.label === answer);
    return {
      id: `CM-S${String(draft.number).padStart(4, "0")}`,
      courseId: COURSE_ID,
      paperId: "CM-CHOICE",
      paperIndex: draft.number,
      index: index + 1,
      type: "single",
      stem: draft.stem,
      options: draft.options,
      answer,
      analysis: analysisForChoice(draft.stem, selected?.text ?? "", draft.number),
      ...(draft.image ? { image: draft.image, imageAlt: draft.imageAlt } : {}),
    } satisfies Question;
  });
}

function splitChoiceBlocks(text: string): ChoiceDraft[] {
  const drafts: ChoiceDraft[] = [];
  const blockPattern = /(?:^|\n)\s*(\d{1,2})[、.．]\s*([\s\S]*?)(?=(?:\n\s*\d{1,2}[、.．]\s*)|$)/g;
  const matches = [...text.matchAll(blockPattern)];

  for (const match of matches) {
    const number = Number(match[1]);
    if (number < 1 || number > 90) {
      continue;
    }

    const rawBlock = cleanupText(match[2]);
    const block = rawBlock.replace(/\[IMAGE\]/g, " ");
    const labels = [...block.matchAll(/\b([A-D])\s*[、.．]\s*/g)];
    if (labels.length < 4) {
      throw new Error(`第 ${number} 题未识别到 A-D 四个选项: ${rawBlock}`);
    }

    const optionStarts = labels.slice(0, 4).map((item) => ({
      label: item[1].toUpperCase(),
      start: item.index ?? 0,
      textStart: (item.index ?? 0) + item[0].length,
    }));
    const stem = cleanupStem(block.slice(0, optionStarts[0].start));
    const options = optionStarts.map((option, optionIndex) => {
      const end = optionStarts[optionIndex + 1]?.start ?? block.length;
      return {
        label: option.label,
        text: cleanupText(block.slice(option.textStart, end)),
      };
    });

    drafts.push({
      number,
      stem,
      options,
      ...(number === 40
        ? {
            image: choiceNetworkImage,
            imageAlt: "第 40 题双代号网络计划图，用于计算工程计划工期。",
          }
        : {}),
    });
  }

  return drafts.sort((left, right) => left.number - right.number);
}

function parseChoiceAnswerTable(text: string): Map<number, string> {
  const answers = new Map<number, string>();
  const rangePattern = /(\d{1,2})\s*-\s*(\d{1,2})\s+([A-D\s]+)/g;

  for (const match of text.matchAll(rangePattern)) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    const letters = match[3].replace(/\s+/g, "").split("");
    const expected = end - start + 1;
    if (letters.length !== expected) {
      throw new Error(`答案表 ${start}-${end} 应有 ${expected} 个答案，实际为 ${letters.length}: ${match[3]}`);
    }
    letters.forEach((letter, offset) => answers.set(start + offset, letter));
  }

  if (answers.size !== 90) {
    throw new Error(`选择题答案数量应为 90，实际为 ${answers.size}。`);
  }

  return answers;
}

function parseSubjectiveQuestions(startIndex: number): Question[] {
  const pdfText = extractPdfText();
  const expectedFragments = [
    "费用目标对业主而言",
    "施工方项目管理的任务",
    "建设工程项目管理的内涵",
    "某工程施工工序包含五个工作",
  ];
  const missingFragments = expectedFragments.filter((fragment) => !pdfText.includes(fragment));
  if (missingFragments.length > 0) {
    throw new Error(`PDF 文本提取结果缺少关键内容: ${missingFragments.join(", ")}`);
  }

  return subjectiveDrafts().map((draft, index) => ({
    id: `CM-B${String(index + 1).padStart(4, "0")}`,
    courseId: COURSE_ID,
    paperId: "CM-SUBJECTIVE",
    paperIndex: index + 1,
    index: startIndex + index + 1,
    type: "blank",
    stem: draft.stem,
    options: [],
    answer: draft.answer,
    analysis: draft.analysis,
    ...(draft.image ? { image: draft.image, imageAlt: draft.imageAlt } : {}),
  } satisfies Question));
}

function subjectiveDrafts(): SubjectiveDraft[] {
  return [
    blankDraft(
      "费用目标对业主而言是（ ）目标，对施工方而言是（ ）目标。",
      ["投资", "成本"],
      "业主关注项目总投资是否受控，施工方关注完成承包任务所发生的施工成本。区分参与方后，费用目标的称谓就能判断。",
      "业主看投资，施工方看成本。",
    ),
    blankDraft(
      "按照工程项目不同参与方的工作性质和组织特征划分，项目管理的类型包括业主方、（ ）、（ ）、供货方和工程总承包方的项目管理。",
      ["施工方", "设计方"],
      "建设工程项目管理按参与主体划分，不同主体围绕自身任务进行管理，但都服务于项目目标实现。常见主体包括业主方、设计方、施工方、供货方和工程总承包方。",
      "先按参与主体分类，再判断该主体承担的管理任务。",
    ),
    blankDraft(
      "对建设工程项目施工负有全面管理责任的是（ ）。",
      ["项目经理"],
      "施工项目经理受企业授权，对施工项目的进度、质量、成本、安全和现场协调承担全面管理责任。",
      "施工现场综合管理责任通常落在项目经理身上。",
    ),
    blankDraft(
      "建设工程监理的工作性质特点有：（ ）、科学性、独立性和（ ）。",
      ["服务性", "公平性"],
      "监理单位不是施工承包人，也不是行政主管部门，其工作以服务业主和工程建设为基础，同时要依照法规、合同和技术标准独立、公平地开展监理。",
      "监理性质常记为服务性、科学性、独立性、公平性。",
    ),
    blankDraft(
      "旁站监理是指项目监理机构对工程的关键部位或（ ）的施工质量进行监督活动。",
      ["关键工序"],
      "旁站监理强调在施工现场对关键部位、关键工序进行跟班监督，目的是及时发现质量风险。",
      "旁站盯的是关键部位和关键工序。",
    ),
    blankDraft(
      "根据施工组织设计编制的广度、深度和作用不同，可分为施工组织总设计、（ ）施工组织设计、分部（分项）工程施工组织设计。",
      ["单位工程"],
      "施工组织设计按对象和深度分层，项目整体用施工组织总设计，单位工程用单位工程施工组织设计，局部专项内容用分部（分项）工程施工组织设计。",
      "总设计、单位工程、分部（分项）工程是常见三级。",
    ),
    blankDraft(
      "成本管理的任务包括成本计划、（ ）、成本核算、（ ）和成本考核。",
      ["成本控制", "成本分析"],
      "施工成本管理不是只算账，还包括事前计划、过程控制、事后核算分析和考核反馈。",
      "成本管理流程常按计划、控制、核算、分析、考核记忆。",
    ),
    blankDraft(
      "施工进度计划的编制方法包含横道图、（ ）网络图、（ ）网络图和双代号时标网络图。",
      ["单代号", "双代号"],
      "施工进度计划可以用横道图表达，也可以用网络计划表达。网络计划常见形式包括单代号、双代号和双代号时标网络图。",
      "网络计划的图示形式要和横道图区分记忆。",
    ),
    blankDraft(
      "在网络计划图中，关键路线是总的工作持续时间最（ ）的线路。",
      ["长"],
      "关键线路决定计算工期；从起点到终点持续时间最长的线路，其上的工作延误通常会直接影响总工期。",
      "关键线路看最长路径，不看工作数量多少。",
    ),
    blankDraft(
      "控制项目目标的主要措施包括组织措施、管理措施、经济措施和技术措施，其中（ ）措施是最重要的措施。",
      ["组织"],
      "项目目标控制首先要明确组织结构、职责分工、工作流程和会议制度。组织关系不清，其他措施很难落实。",
      "目标控制四类措施中，组织措施通常最重要。",
    ),
    blankDraft(
      "施工项目发生安全事故后必须坚持“四不放过”原则，包括（ ）不放过、责任人员未受到处理不放过、整改措施未落实不放过、有关人员没有受到教育不放过。",
      ["事故原因未查清"],
      "四不放过用于事故调查处理，核心是原因查清、责任处理、整改落实和教育到位，防止同类事故再次发生。",
      "四不放过围绕原因、责任、整改、教育四件事。",
    ),
    blankDraft(
      "建设工程参建各方中具有投资目标的项目管理包括：（ ）方、（ ）方和项目总承包方的项目管理。",
      ["业主", "设计"],
      "具有投资目标的一般是能影响建设投资或总投资控制的参与方。业主方直接承担投资目标，设计方和工程总承包方也会影响项目投资控制。",
      "看到投资目标，优先联想到业主方，并结合设计和总承包对投资的影响。",
    ),
    blankDraft(
      "施工方项目管理的任务包含“三管三控一协调”，具体是指什么？",
      ["安全管理、合同管理、信息管理、成本控制、质量控制、进度控制、组织与协调"],
      "三管三控一协调是施工方项目管理任务的概括：管理侧重安全、合同、信息，控制侧重成本、质量、进度，最后还要做好组织协调。",
      "三管是安全、合同、信息；三控是成本、质量、进度。",
    ),
    blankDraft(
      "施工方项目管理的任务是什么？",
      ["安全管理、合同管理、信息管理、成本控制、质量控制、进度控制、组织与协调"],
      "施工方项目管理围绕施工合同和现场实施展开，既要管安全、合同、信息，也要控成本、质量、进度，并协调参与人员和资源。",
      "用“三管三控一协调”能快速展开完整答案。",
    ),
    blankDraft(
      "请列出参与工程建设的各方。",
      ["业主方、设计方、施工方、供货方、建设项目工程总承包方、监理方"],
      "建设工程项目由多个主体共同参与，不同主体有不同利益和管理任务。列举时应覆盖业主、勘察设计、施工、供货、工程总承包和监理等主要参与方。",
      "按项目建设链条从业主、设计、施工、供货、总承包、监理来记。",
    ),
    blankDraft(
      "安全事故的“四不放过”原则是什么？",
      ["事故原因未查清不放过、责任人员未受到处理不放过、整改措施未落实不放过、有关人员没有受到教育不放过"],
      "四不放过要求事故处理不能停留在结果统计上，必须查原因、追责任、抓整改、做教育，形成闭环。",
      "原因、责任、整改、教育是四个关键词。",
    ),
    blankDraft(
      "请按照时间顺序列出工程的基本建设程序。",
      ["项目建议书阶段、可行性研究阶段、初步设计阶段、施工图设计阶段、施工准备阶段、施工阶段、生产动用前准备阶段、竣工验收、保修阶段"],
      "基本建设程序体现项目从决策到设计、施工、交付和保修的全过程。作答时按时间顺序展开，不能把竣工验收、保修提前。",
      "先决策研究，再设计施工，最后竣工验收和保修。",
    ),
    blankDraft(
      "建设工程项目管理的内涵是指什么？",
      ["自项目开始至项目完成，通过项目策划和项目控制，使项目的费用目标、进度目标和质量目标得以实现。"],
      "建设工程项目管理强调全过程管理，用项目策划确定方向，用项目控制纠偏，最终服务费用、进度和质量三大目标。",
      "项目管理内涵抓住全过程、策划与控制、三大目标。",
    ),
    blankDraft(
      "请写出成本控制的流程。",
      ["成本预测、成本计划、成本控制、成本核算、成本分析、成本考核"],
      "成本控制流程先预测目标，再形成计划；实施中进行控制，完成后通过核算、分析和考核反馈管理效果。",
      "成本流程按预测、计划、控制、核算、分析、考核顺序记。",
    ),
    blankDraft(
      "请写出质量事故处理的一般程序。",
      ["事故上报、组织事故调查、分析事故产生原因、编制事故处理技术方案、实施事故处理、处理结果检查验收、编写并上报事故处理总结报告"],
      "质量事故处理要先报告和调查，再分析原因、制定并实施处理方案，最后进行验收和总结上报，形成闭环管理。",
      "事故处理顺序是报告、调查、分析、方案、处理、验收、总结。",
    ),
    {
      stem: "网络计划综合计算题：某工程施工工序包含 A、B、C、D、E、F、G 七个工作，其时间和对应紧前工作如图所示。请绘制双代号网络图，计算各工作的六时标，写出工期并给出关键线路。",
      answer: [
        [
          "（1）双代号网络图：",
          "可按下列逻辑关系绘制：",
          "A：1→2，持续 1 天；",
          "C：1→3，持续 5 天；",
          "B：2→4，持续 2 天；",
          "D：3→4，持续 4 天；",
          "E：3→5，持续 5 天；",
          "F：4→6，持续 5 天；",
          "G：5→6，持续 3 天；",
          "同时需要设置虚工作 2→3，用来表达 D、E 同时受 A、C 约束的逻辑关系。",
          "",
          "（2）各工作的六时标：",
          "A：ES=0，EF=1，LS=4，LF=5，TF=4，FF=0；",
          "B：ES=1，EF=3，LS=7，LF=9，TF=6，FF=6；",
          "C：ES=0，EF=5，LS=0，LF=5，TF=0，FF=0；",
          "D：ES=5，EF=9，LS=5，LF=9，TF=0，FF=0；",
          "E：ES=5，EF=10，LS=6，LF=11，TF=1，FF=0；",
          "F：ES=9，EF=14，LS=9，LF=14，TF=0，FF=0；",
          "G：ES=10，EF=13，LS=11，LF=14，TF=1，FF=1。",
          "",
          "（3）工期和关键线路：",
          "计算工期为 14 天。",
          "关键线路为 C→D→F。",
          "原因是 C、D、F 的总时差均为 0，且该线路持续时间 5+4+5=14 天，为从起点到终点的最长线路。",
        ].join("\n"),
      ],
      analysis: [
        "答题思路：",
        "本题是网络计划综合计算题。先根据紧前工作关系画出网络逻辑关系；再从起点向终点正推计算最早开始 ES 和最早完成 EF；再从终点向起点逆推计算最迟开始 LS 和最迟完成 LF；最后计算总时差 TF 和自由时差 FF。总时差为 0 的工作组成关键线路。本题关键线路为 C-D-F，工期为 14 天。",
        "关键点：",
        "网络计划题不要只背图，要掌握“先正推、再逆推、最后看总时差”的步骤。",
        "易错点：",
        "D 和 E 的紧前工作都是 A、C，画双代号网络图时要用虚工作表达逻辑关系；不要漏掉虚工作，也不要把答案图提前作为题干图展示。",
      ].join("\n"),
      image: subjectiveNetworkDataImage,
      imageAlt: "第 20 题施工工序持续时间和紧前工作关系表，用于绘制双代号网络图。",
    },
  ];
}

function blankDraft(stem: string, answer: string[], thought: string, keyPoint: string): SubjectiveDraft {
  return {
    stem,
    answer,
    analysis: ["答题思路：", thought, "关键点：", keyPoint].join("\n"),
  };
}

function analysisForChoice(stem: string, optionText: string, number: number): string {
  if (number === 65) {
    return sectionAnalysis(
      '源文件中同题干题目存在答案表冲突：第 19、49 题给出项目进度控制，第 65 题答案表给出 D。按教材概念，建设工程项目进度计划系统通常是项目进度控制的依据，建议人工核对该题答案表。',
      '同题干答案冲突已保留，复习时以教材概念和教师口径核对。',
      '不要在未核对来源的情况下自动删除答案冲突题。',
    );
  }

  const text = `${stem} ${optionText}`;
  const key = normalizeForRule(text);

  if (number === 84) {
    return sectionAnalysis(
      "事故等级应分别看死亡人数、重伤人数和直接经济损失，再取达到的较重等级。本题 1 人死亡、11 人重伤、直接经济损失 2000 万元，其中重伤人数和经济损失均达到较大事故范围。",
      "事故等级按死亡、重伤、直接经济损失分别判断，取较重等级。",
      "不要只看死亡人数；1 人死亡虽未达到较大事故，但 11 人重伤和 2000 万元损失会提高等级判断。",
    );
  }
  if (number === 85) {
    return sectionAnalysis(
      "主要分部工程在政府监督机构监督验收合格后，建设单位应在规定期限内把质量验收证明文件报工程质量监督机构备案。本题考查备案时限，常考为 3 天。",
      "主要分部工程质量验收证明文件备案时限记 3 天。",
      "这类题问的是备案期限，不是材料进场签字或监理审批权限。",
    );
  }
  if (number === 88) {
    return sectionAnalysis(
      "事故等级要把补报期内的伤亡变化计入判断，并按死亡人数、重伤人数、直接经济损失等指标取较重等级。本题补报后为 2 人死亡、11 人重伤，重伤人数达到较大事故范围。",
      "补报期内伤亡变化要并入事故等级，按较重指标确定等级。",
      "不要只按最初 11 人重伤判断，也不要忽略补报后的死亡人数变化。",
    );
  }
  if (number === 89) {
    return sectionAnalysis(
      "生产安全事故等级按死亡人数、重伤人数、直接经济损失以及急性工业中毒人数等指标判断，取达到的最高等级。120 名操作工人急性工业中毒，已达到特别重大事故范围。",
      "急性工业中毒人数也用于事故分级，100 人以上通常按特别重大事故掌握。",
      "事故分级不是只看死亡人数，群体中毒人数达到上限时等级会更高。",
    );
  }

  if (/关键线路|关键路线/.test(key)) {
    return sectionAnalysis(
      "网络计划中关键线路决定计算工期，通常表现为总持续时间最长，或由总时差为 0 的关键工作连续组成。判断时要从起点到终点看整条线路，而不是只看单个工作。",
      "关键线路看最长路径和总时差为 0。",
      "关键线路可能不止一条，且项目执行中可能随进度变化而转移。",
    );
  }
  if (/关键工作/.test(key)) {
    return sectionAnalysis(
      "关键工作是对总工期最敏感的工作，通常总时差最小；当计划工期等于计算工期时，关键工作的总时差为 0。",
      "判断关键工作优先看总时差。",
      "持续时间最长的单个工作不一定就是关键工作。",
    );
  }
  if (/自由时差/.test(key)) {
    return sectionAnalysis(
      "自由时差是不影响紧后工作最早开始时间的机动时间，范围比总时差更受限制。题干出现“不影响紧后工作最早开始”时，应判断为自由时差。",
      "自由时差只看对紧后工作最早开始的影响。",
    );
  }
  if (/总时差/.test(key)) {
    return sectionAnalysis(
      "总时差表示在不影响总工期的前提下某工作可利用的机动时间。网络计划中常用总时差判断关键工作和关键线路。",
      "总时差控制总工期，自由时差控制紧后工作。",
    );
  }
  if (/虚工作|虚箭线/.test(key)) {
    return sectionAnalysis(
      "虚工作不消耗时间和资源，主要用于表达双代号网络图中的逻辑关系。实际施工过程如混凝土养护不能简单当作虚工作处理。",
      "虚工作只表示逻辑关系，不表示真实施工活动。",
    );
  }
  if (/计算工期|双代/.test(key) && number === 40) {
    return sectionAnalysis(
      "网络图计算工期要按图从起点到终点逐条累计线路持续时间，最长线路的持续时间就是计算工期。本题图中最长线路对应 22 天。",
      "计算工期取网络图最长线路时间。",
      "不要把某一条局部路径或单个工作的持续时间当成总工期。",
    );
  }
  if (/进度控制.*技术措施|技术措施/.test(key)) {
    return sectionAnalysis(
      "进度控制的技术措施通常与设计方案、施工方案、施工方法和技术路线优化有关。题干涉及优化设计或施工方案时，应归入技术措施。",
      "技术措施看方案和技术路线。",
      "信息技术应用通常归入管理措施，不要和技术措施混淆。",
    );
  }
  if (/进度控制.*组织措施|组织措施|会议的组织设计/.test(key)) {
    return sectionAnalysis(
      "组织措施关注组织结构、职责分工、工作流程和会议制度等安排。进度控制会议如何组织，属于通过组织体系保障进度目标。",
      "组织措施看人、岗位、流程和会议制度。",
    );
  }
  if (/管理措施|信息技术|承发包模式|合同结构|网络方法/.test(key)) {
    return sectionAnalysis(
      "管理措施强调管理方法、合同模式、承发包模式、信息技术和计划方法的运用。采用信息技术或网络计划方法辅助进度控制，通常属于管理措施。",
      "管理措施看方法、合同、信息和计划手段。",
      "优化施工方案才更偏技术措施。",
    );
  }
  if (/控制性施工进度计划/.test(key)) {
    return sectionAnalysis(
      "控制性施工进度计划用于确定总体部署、控制节点和合同进度目标，是项目层面的控制依据。作业班组的具体责任划分更偏实施性安排，不属于控制性计划的核心内容。",
      "控制性计划抓总体部署和控制节点。",
    );
  }
  if (/实施性施工进度计划|月度施工计划/.test(key)) {
    return sectionAnalysis(
      "实施性施工进度计划面向现场近期施工安排，通常落实到月、旬、周等较细层级。月度施工计划比总进度计划更接近现场执行。",
      "实施性计划越具体，越接近现场作业。",
    );
  }
  if (/编制深度|总进度计划|单项工程|单位工程/.test(key)) {
    return sectionAnalysis(
      "按编制深度划分时，进度计划可分为总进度计划、单项工程进度计划和单位工程进度计划。这里强调的是计划对象和深度层级。",
      "编制深度看总、单项、单位工程三个层级。",
    );
  }
  if (/进度计划系统/.test(key)) {
    return sectionAnalysis(
      "建设工程项目进度计划系统由多个相互关联的计划组成，是进度控制的依据。它不是一次性固定成果，而是在项目进展过程中逐步形成和完善。",
      "进度计划系统服务于进度控制，并随项目推进逐步形成。",
    );
  }
  if (/小型项目施工/.test(key)) {
    return sectionAnalysis(
      "小型项目规模较小、层级较少，进度安排通常只需要施工总进度计划即可满足控制需要，不必编制过多层级的规划。",
      "项目越小，进度计划层级越简化。",
    );
  }
  if (/施工生产计划|施工进度计划/.test(key)) {
    return sectionAnalysis(
      "施工企业的施工生产计划属于企业管理系统，项目施工进度计划属于具体建设工程项目管理系统。二者系统不同，但在资源、工期和施工组织上紧密相关。",
      "企业生产计划和项目进度计划不同系统但密切相关。",
    );
  }
  if (/设计方进度控制/.test(key)) {
    return sectionAnalysis(
      "设计方进度控制的直接依据是设计任务委托合同，因为合同明确了设计工作范围、成果和时间要求。",
      "设计进度控制看设计任务委托合同。",
    );
  }
  if (/业主方进度控制/.test(key)) {
    return sectionAnalysis(
      "业主方是项目实施阶段全过程进度目标的主要控制主体，控制范围覆盖设计、招采、施工、动用前准备等整个实施阶段。",
      "业主方进度控制看整个实施阶段。",
    );
  }
  if (/施工总承包管理/.test(key)) {
    return sectionAnalysis(
      "施工总承包管理方的核心责任是对分包施工进行组织、协调和管理；若其想承担部分施工任务，通常也应通过投标竞争取得。",
      "总承包管理重在管理分包，不等同于自动承接施工。",
    );
  }
  if (/施工方.*项目管理|项目的整体利益|核心是.*业主|参与方/.test(key)) {
    return sectionAnalysis(
      "施工方项目管理既服务自身合同利益，也必须服从项目整体目标。建设工程项目参与方很多，但业主方的项目管理通常居于核心地位。",
      "施工方服务项目整体利益，项目管理核心通常是业主方。",
    );
  }
  if (/EPC|工程总承包方/.test(key)) {
    return sectionAnalysis(
      "EPC 工程总承包方的项目管理覆盖设计前准备、设计、施工、动用前准备和保修期等阶段，范围比单纯施工管理更宽。",
      "EPC 管理贯穿设计前准备到保修期。",
    );
  }
  if (/决策阶段|项目的定义/.test(key)) {
    return sectionAnalysis(
      "建设项目决策阶段管理工作的核心是确定项目的定义，包括建设目的、规模、功能、投资目标等基础问题。",
      "决策阶段先回答项目是什么、为什么建。",
    );
  }
  if (/矩阵组织结构/.test(key)) {
    return sectionAnalysis(
      "矩阵组织结构适用于大型、复杂、跨部门协作强的项目，可以减少组织层级并加强横向协调。但双重指令容易冲突，需要明确以哪一方指令为主。",
      "矩阵结构重协调，指令冲突时要明确主导关系。",
    );
  }
  if (/组织结构图|矩形框/.test(key)) {
    return sectionAnalysis(
      "组织结构图反映组织系统中各工作部门之间的指令关系，矩形框表示组织系统中的一个组成部分或工作部门。",
      "组织结构图看部门和指令关系。",
    );
  }
  if (/工作流程图|工作流程/.test(key)) {
    return sectionAnalysis(
      "工作流程图用于描述工作之间的逻辑关系和流转顺序，是工作流程组织的表达工具。它不同于组织结构图，不能用来表示部门指令关系。",
      "工作流程图看工作流向，不看组织层级。",
    );
  }
  if (/项目结构图/.test(key)) {
    return sectionAnalysis(
      "项目结构图是对项目组成进行逐层分解的组织工具，关注项目由哪些部分构成，不表示合同关系或部门指令关系。",
      "项目结构图看项目组成分解。",
    );
  }
  if (/管理职能分工表/.test(key)) {
    return sectionAnalysis(
      "管理职能分工表通常用拉丁字母表示不同管理职能，用来明确各参与部门在提出、筹划、决策、执行、检查等环节中的职责。",
      "管理职能分工表用字母表达管理职能。",
    );
  }
  if (/施工组织设计/.test(key)) {
    return sectionAnalysis(
      "施工组织设计按编制对象和深度可分为施工组织总设计、单位工程施工组织设计、分部（分项）工程施工组织设计。",
      "施工组织设计按总、单位工程、分部（分项）工程分层。",
    );
  }
  if (/目标责任书|项目经理/.test(key)) {
    return sectionAnalysis(
      "项目管理目标责任书应在项目实施前，由组织法定代表人或其授权人与项目经理协商制定，用来明确项目经理的目标和责任。",
      "目标责任书由法定代表人或授权人与项目经理协商。",
    );
  }
  if (/施工成本管理组织措施|工作流程/.test(key)) {
    return sectionAnalysis(
      "施工成本管理的组织措施强调责任分工、工作流程、管理机构和人员配置。确定合理详细的工作流程属于组织措施。",
      "成本组织措施看责任、流程、机构和人员。",
    );
  }
  if (/成本计划的编制/.test(key)) {
    return sectionAnalysis(
      "成本计划编制一般先预测项目成本并确定总体成本目标，再编制总体成本计划和分解责任成本，随后制定控制措施并履行审批。",
      "成本计划先预测和定目标，再编制、分解、控制、审批。",
    );
  }
  if (/分部分项工程成本分析|预算成本/.test(key)) {
    return sectionAnalysis(
      "分部分项工程成本分析通常比较预算成本、目标成本和实际成本。其中预算成本来自投标报价成本，目标成本来自施工预算，实际成本来自施工任务单和限额领料等资料。",
      "预算成本看投标报价成本。",
    );
  }
  if (/质量管理体系|GB\/T19000|质量管理就是/.test(key)) {
    return sectionAnalysis(
      "质量管理体系中的质量管理职能通常通过质量策划、质量保证、质量控制和质量改进来实现。这里考查标准术语，不是日常检查流程。",
      "质量管理职能记策划、保证、控制、改进。",
    );
  }
  if (/第三方认证|监督管理/.test(key)) {
    return sectionAnalysis(
      "第三方认证机构对施工企业质量管理体系认证后的监督管理通常每年进行一次，用于确认体系持续符合要求。",
      "质量体系认证监督一般按年进行。",
    );
  }
  if (/质量手册|程序文件|质量记录/.test(key)) {
    return sectionAnalysis(
      "质量手册是质量管理体系的纲领性文件，用来阐明质量方针、质量体系和组织质量管理的基本要求。",
      "质量手册管方针和体系，程序文件管流程。",
    );
  }
  if (/取样|力学性能检测|试验法/.test(key)) {
    return sectionAnalysis(
      "对材料取样后进行力学性能检测，需要通过试验取得数据，属于施工质量控制方法中的试验法。",
      "取样检测、强度试验归入试验法。",
    );
  }
  if (/事前控制|设计交底/.test(key)) {
    return sectionAnalysis(
      "事前控制发生在施工活动正式实施前，重点是技术准备、设计交底、方案审查和资源条件确认。设计交底属于典型事前控制。",
      "事前控制看施工前的准备和预防。",
    );
  }
  if (/质量事故|混凝土实体强度|不作处理/.test(key)) {
    return sectionAnalysis(
      "质量问题经法定检测单位鉴定后，如果实体强度满足规范允许和设计要求，可以不作专门处理，但应保留检测和认定资料。",
      "满足设计和规范要求时，可采取不作处理。",
    );
  }
  if (/质量管理条例|建筑材料|监理工程师/.test(key)) {
    return sectionAnalysis(
      "进入工程使用的建筑材料、构配件和设备应经专业监理工程师签字认可。总监主要负责更高层级的监理审批和组织管理。",
      "材料使用把关通常看专业监理工程师。",
    );
  }
  if (/事故等级|重伤|死亡|经济损失|工业中毒/.test(key)) {
    return sectionAnalysis(
      "事故等级按死亡人数、重伤人数、直接经济损失或急性工业中毒人数判断，取其中达到的最高等级。120 人急性工业中毒属于特别重大事故。",
      "事故分级按人员伤亡、中毒人数和经济损失从严判定。",
      "补报期内伤亡变化应计入事故等级判断。",
    );
  }
  if (/职业健康|构成要素/.test(key)) {
    return sectionAnalysis(
      "职业健康安全管理体系包括方针、策划、实施与运行、检查和纠正措施、管理评审等要素。应急准备和响应通常属于实施与运行中的内容，不是并列的结构要素。",
      "体系结构要素和运行细项不要混记。",
    );
  }
  if (/施工起重机械|登记/.test(key)) {
    return sectionAnalysis(
      "施工起重机械和整体提升脚手架、模板等自升式架设设施验收合格后，施工单位应在规定期限内向主管部门登记，常考期限为 30 日。",
      "起重机械等验收合格后 30 日内登记。",
    );
  }
  if (/围挡/.test(key)) {
    return sectionAnalysis(
      "市区主要路段施工现场围挡要求较高，通常不宜低于 2.5m；一般路段要求相对较低。",
      "市区主要路段围挡高度记 2.5m。",
    );
  }

  return sectionAnalysis(
    `本题考查建设工程项目管理基础概念，应先抓题干限定的主体、阶段或管理措施，再和选项中的“${optionText || "核心概念"}”对应起来判断。`,
    "先识别主体、阶段、措施类别，再判断适用概念。",
  );
}

function sectionAnalysis(thought: string, keyPoint: string, mistake?: string): string {
  return [
    "答题思路：",
    thought,
    "关键点：",
    keyPoint,
    ...(mistake ? ["易错点：", mistake] : []),
  ].join("\n");
}

function extractDocxNetworkImage() {
  const buffer = fs.readFileSync(choiceDocxPath);
  const image = readZipEntry(buffer, "word/media/image1.png");
  fs.writeFileSync(path.join(imageDir, path.basename(choiceNetworkImage)), image);
}

function extractPdfNetworkImages(): string[] {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cm-pdf-images-"));
  const prefix = path.join(tempDir, "pdf-image");
  execFileSync("pdfimages", ["-png", subjectivePdfPath, prefix], { stdio: "ignore" });

  const images = fs.readdirSync(tempDir)
    .filter((file) => /^pdf-image-\d+\.(?:png|ppm|pbm|jpg)$/i.test(file))
    .sort((left, right) => left.localeCompare(right));

  if (images.length < 2) {
    throw new Error(`PDF 应至少提取到 2 张图片，实际为 ${images.length}。`);
  }

  const dataSource = path.join(tempDir, images[0]);
  const answerSource = path.join(tempDir, images[1]);
  fs.copyFileSync(dataSource, path.join(imageDir, path.basename(subjectiveNetworkDataImage)));
  fs.copyFileSync(answerSource, path.join(imageDir, path.basename(subjectiveNetworkAnswerImage)));

  return [
    `PDF 图片 1 -> ${subjectiveNetworkDataImage}`,
    `PDF 图片 2 -> ${subjectiveNetworkAnswerImage}`,
  ];
}

function extractPdfText(): string {
  return execFileSync("pdftotext", ["-layout", subjectivePdfPath, "-"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 8,
  }).replace(/\r/g, "\n");
}

function ensureCourse() {
  const courses = JSON.parse(stripBom(fs.readFileSync(coursesPath, "utf8"))) as Course[];
  const existingIndex = courses.findIndex((course) => course.id === COURSE_ID);

  if (existingIndex >= 0) {
    courses[existingIndex] = { ...courses[existingIndex], ...COURSE };
  } else {
    courses.push(COURSE);
  }

  fs.writeFileSync(coursesPath, `${JSON.stringify(courses, null, 2)}\n`, "utf8");
}

function docxXmlToText(xml: string): string {
  return decodeEntities(xml)
    .replace(/<w:drawing[\s\S]*?<\/w:drawing>/g, "\n[IMAGE]\n")
    .replace(/<w:tab\s*\/>/g, " ")
    .replace(/<w:br\s*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function readZipEntry(buffer: Buffer, entryName: string): Buffer {
  const endOfCentralDirectoryOffset = findEndOfCentralDirectory(buffer);
  const centralDirectorySize = buffer.readUInt32LE(endOfCentralDirectoryOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(endOfCentralDirectoryOffset + 16);
  const entry = findZipEntry(buffer, centralDirectoryOffset, centralDirectorySize, entryName);

  if (!entry) {
    throw new Error(`docx 中没有找到 ${entryName}`);
  }

  const fileNameLength = buffer.readUInt16LE(entry.localHeaderOffset + 26);
  const extraLength = buffer.readUInt16LE(entry.localHeaderOffset + 28);
  const dataOffset = entry.localHeaderOffset + 30 + fileNameLength + extraLength;
  const compressed = buffer.subarray(dataOffset, dataOffset + entry.compressedSize);

  if (entry.method === 0) {
    return compressed;
  }
  if (entry.method === 8) {
    return zlib.inflateRawSync(compressed);
  }
  throw new Error(`${entry.name} 使用了暂不支持的 zip 压缩方式: ${entry.method}`);
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minOffset = Math.max(0, buffer.length - 66000);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  throw new Error("不是有效的 docx/zip 文件。");
}

function findZipEntry(buffer: Buffer, offset: number, size: number, entryName: string): ZipEntry | null {
  let cursor = offset;
  const end = offset + size;

  while (cursor < end) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error("docx central directory 结构异常。");
    }

    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + fileNameLength).toString("utf8");

    if (name === entryName) {
      return { compressedSize, localHeaderOffset, method, name };
    }

    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  return null;
}

function countTypes(questions: Question[]): Record<"single" | "multiple" | "judge" | "blank", number> {
  return questions.reduce(
    (counts, question) => {
      counts[question.type] += 1;
      return counts;
    },
    { single: 0, multiple: 0, judge: 0, blank: 0 },
  );
}

function cleanupStem(value: string): string {
  return cleanupText(value)
    .replace(/\s*[（(]\s*[)）]\s*/g, "（ ）")
    .replace(/\s+([。；，、])/g, "$1")
    .trim();
}

function cleanupText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForRule(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "");
}

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "");
}

function assertFileExists(filePath: string) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`找不到源文件: ${filePath}`);
  }
}
