import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { decode as decodeEntities } from "html-entities";
import type { AnswerValue, Question, QuestionOption, QuestionType } from "../src/types";

interface ZipEntry {
  compressedSize: number;
  localHeaderOffset: number;
  method: number;
  name: string;
}

interface DraftQuestion {
  type: QuestionType;
  stem: string;
  options: QuestionOption[];
  rawAnswer: string;
}

const COURSE_ID = "power-plant";
const ID_PREFIX = "PP";
const inputPath = path.resolve("raw/power-plant/发电厂题库.docx");
const outputPath = path.resolve("src/data/questions/power-plant.json");

const SHORT_ANSWERS_BY_STEM: Record<string, string> = {
  "什么是一次设备和二次设备？哪些设备属于一次设备？哪些设备属于二次设备？": `一次设备是直接参与电能生产、变换、输送、分配和使用的电气设备，通常工作在主电路中，承受高电压或大电流。常见一次设备包括发电机、变压器、断路器、隔离开关、母线、电力电缆、输电线路、电流互感器、电压互感器、电抗器、电容器、避雷器、接地开关等。
二次设备是对一次设备进行测量、监视、控制、保护、调节和信号指示的设备，通常接在二次回路中。常见二次设备包括测量仪表、继电保护装置、自动装置、控制开关、信号装置、操作电源、控制电缆、监控系统等。
核心区别：一次设备直接传输和分配电能，二次设备服务于一次设备的控制、保护和监测。`,
  "GN19-10/630是什么设备，并读出型号中字母和数字的含义。": `GN19-10/630 是户内高压隔离开关。
型号含义：
G 表示隔离开关；
N 表示户内式；
19 表示设计序号；
10 表示额定电压为 10 kV；
630 表示额定电流为 630 A。
该设备主要用于在无负荷电流情况下隔离电源、形成明显断开点，也可用于规定条件下的小电流回路操作。`,
  "高压开关柜的作用是什么？": `高压开关柜是用于发电厂、变电站和工矿企业配电系统中的成套配电装置，主要作用是接受和分配电能，并对电路和电气设备进行控制、测量、保护和监视。
它通常把断路器、隔离触头、接地开关、母线、电流互感器、电压互感器、避雷器、继电保护和测控装置等安装在金属柜体内。
其作用可概括为：分配电能、控制电路、保护设备、测量运行参数、实现安全闭锁、防止误操作。`,
  "电流互感器的特点是什么？运行中的电流互感器二次侧为什么不允许开路？": `电流互感器的特点是：一次绕组匝数少、导线较粗，并与被测电路串联；二次绕组匝数多，通常接电流表、继电器或保护装置；二次侧额定电流一般为 5A 或 1A；运行时二次侧接近短路状态。
运行中的电流互感器二次侧不允许开路，因为二次侧开路后，二次电流为零，铁芯中的磁通急剧增大，会在二次绕组感应出很高电压，危及人身和设备安全；同时铁芯严重饱和、发热，可能烧毁绝缘并造成互感器损坏。因此运行中电流互感器二次侧必须可靠接地，严禁开路。`,
  "画出单母线分段接线的线路图，并简述其接线特点。": `单母线分段接线示意：

电源1 ---- QF1 ---- 母线Ⅰ ---- 出线1、出线2
                         |
                       分段断路器 QF
                         |
电源2 ---- QF2 ---- 母线Ⅱ ---- 出线3、出线4

接线特点：
单母线分段接线是把一组母线分成两段或多段，各段母线之间通过分段断路器连接。正常运行时，两段母线可分列运行或并列运行；当一段母线发生故障或检修时，可通过断开分段断路器限制停电范围，另一段母线仍可继续供电。
优点是接线较简单、投资较少、运行方式较灵活、供电可靠性高于单母线不分段接线。
缺点是母线故障或检修时，该段母线所接负荷仍会停电，可靠性低于双母线接线。`,
  "根据变电站在电力系统中的地位，变电站可分为哪几类？": `根据变电站在电力系统中的地位和作用，通常可分为：
1. 枢纽变电站：位于电力系统重要节点，连接多个电源和多个电压等级，对系统运行影响大。
2. 中间变电站：位于输电线路中间，主要承担电能变换、联络和转供任务。
3. 地区变电站：向一个地区或城市供电，是区域供电的重要节点。
4. 终端变电站：位于供电网络末端，主要向用户或配电网供电。
5. 企业变电站或用户变电站：为工矿企业、园区或大型用户供电。
其分类核心依据是变电站在电网中的位置、供电范围、连接关系和承担的运行任务。`,
  "高压开关柜的是如何分类的？": `高压开关柜可按以下方式分类：
1. 按安装地点分：户内式和户外式。
2. 按柜体结构分：金属封闭铠装式、金属封闭间隔式、金属封闭箱式、敞开式等。
3. 按断路器安装方式分：固定式和手车式。
4. 按绝缘介质分：空气绝缘开关柜、SF6 气体绝缘开关柜、固体绝缘开关柜等。
5. 按用途分：进线柜、出线柜、计量柜、母联柜、隔离柜、电压互感器柜、电容器柜等。
6. 按电压等级分：3kV、6kV、10kV、35kV 等高压开关柜。
常见 KYN28A-12 属于户内金属铠装移开式高压开关柜。`,
  "电流互感器和电压互感器的区别是什么？": `电流互感器和电压互感器的主要区别如下：
1. 接线方式不同：电流互感器一次绕组与被测电路串联；电压互感器一次绕组与被测电路并联。
2. 运行状态不同：电流互感器二次侧接近短路运行，严禁开路；电压互感器二次侧接近开路运行，严禁短路。
3. 作用不同：电流互感器用于把大电流变成标准小电流，供测量和保护使用；电压互感器用于把高电压变成标准低电压，供测量、保护和同期等使用。
4. 二次额定值不同：电流互感器二次额定电流常为 5A 或 1A；电压互感器二次额定电压常为 100V 或 100/√3V。
5. 故障风险不同：电流互感器二次开路会产生高电压；电压互感器二次短路会产生大电流并可能熔断熔断器或烧毁设备。`,
  "并联电抗器的主要作用是什么？": `并联电抗器主要用于吸收电力系统中过剩的容性无功功率，限制工频过电压，改善系统电压分布，提高电力系统运行稳定性。
在长距离输电线路、电缆线路或轻载运行时，线路电容效应会产生较多容性无功，使末端电压升高。并联电抗器接入后可吸收这部分无功功率，抑制电压升高。
其主要作用包括：补偿线路电容电流、限制过电压、降低轻载或空载线路电压、改善无功平衡、提高系统运行可靠性。`,
  "画出一个半断路器接线的线路图，并简述其接线特点。": `一个半断路器接线示意：

母线Ⅰ =================================
        |        |        |
       QF1      QF3      QF5
        |        |        |
      回路1     回路2     回路3
        |        |        |
       QF2      QF4      QF6
        |        |        |
母线Ⅱ =================================

更典型的一串两回路形式：

母线Ⅰ ---- QF1 ---- 回路1 ---- QF2 ---- 回路2 ---- QF3 ---- 母线Ⅱ

接线特点：
一个半断路器接线是每两个回路共用三个断路器，平均每个回路占用一个半断路器，因此称为一个半断路器接线。
优点是可靠性高、运行灵活，一组母线检修或一台断路器检修时，一般不会造成回路停电；任一母线故障时，可通过断路器切换保持多数回路继续运行。
缺点是接线复杂、断路器数量较多、投资较大、继电保护和运行操作较复杂。
该接线常用于大型发电厂和超高压、重要变电站。`,
};

if (!fs.existsSync(inputPath)) {
  throw new Error(`未找到发电厂题库文件: ${inputPath}`);
}

const lines = docxToLines(fs.readFileSync(inputPath));
const { questions, missingAnswerIds, unknownTypeIds } = parseQuestions(lines);
const counts = countTypes(questions);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(questions, null, 2)}\n`, "utf8");

console.log(`题库文件: ${path.basename(inputPath)}`);
console.log(`总题数: ${questions.length}`);
console.log(`单选数量: ${counts.single}`);
console.log(`多选数量: ${counts.multiple}`);
console.log(`判断数量: ${counts.judge}`);
console.log(`简答数量: ${counts.blank}`);
if (missingAnswerIds.length > 0) {
  console.warn(`警告: 以下题目没有答案: ${missingAnswerIds.join(", ")}`);
}
if (unknownTypeIds.length > 0) {
  console.warn(`警告: 以下题目无法识别题型: ${unknownTypeIds.join(", ")}`);
}
console.log("前 3 题预览:");
console.log(
  JSON.stringify(
    questions.slice(0, 3).map((question) => ({
      id: question.id,
      courseId: question.courseId,
      index: question.index,
      type: question.type,
      stem: question.stem.slice(0, 100),
      options: question.options,
      answer: question.answer,
    })),
    null,
    2,
  ),
);

function docxToLines(buffer: Buffer): string[] {
  const documentXml = readZipEntry(buffer, "word/document.xml").toString("utf8");
  return decodeEntities(documentXml)
    .replace(/<w:tab\s*\/>/g, "\t")
    .replace(/<w:br\s*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\r/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
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

function findZipEntry(
  buffer: Buffer,
  offset: number,
  size: number,
  entryName: string,
): ZipEntry | null {
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

function parseQuestions(lines: string[]): {
  questions: Question[];
  missingAnswerIds: string[];
  unknownTypeIds: string[];
} {
  const drafts: DraftQuestion[] = [];
  let activeType: QuestionType | null = null;
  let draft: DraftQuestion | null = null;

  function flushDraft() {
    if (!draft) {
      return;
    }
    draft.stem = cleanupStem(draft.stem);
    draft.rawAnswer = stripAnswerPrefix(draft.rawAnswer);
    drafts.push(draft);
    draft = null;
  }

  for (const line of lines) {
    const sectionType = parseSectionHeading(line);
    if (sectionType) {
      flushDraft();
      activeType = sectionType;
      continue;
    }
    if (!activeType) {
      continue;
    }

    const answer = parseAnswerLine(line);
    if (answer !== null) {
      if (draft) {
        draft.rawAnswer = answer;
        flushDraft();
      }
      continue;
    }

    const option = parseOptionLine(line);
    if (option && draft && (activeType === "single" || activeType === "multiple")) {
      draft.options.push(option);
      continue;
    }

    if (
      draft &&
      (activeType === "single" || activeType === "multiple") &&
      draft.options.length > 0
    ) {
      const lastOption = draft.options[draft.options.length - 1];
      lastOption.text = appendText(lastOption.text, line);
      continue;
    }

    if (activeType === "blank") {
      const inline = splitInlineShortAnswer(line);
      if (draft && looksLikeQuestionStart(line)) {
        flushDraft();
      }
      draft = {
        type: activeType,
        stem: draft ? appendText(draft.stem, inline.stem) : inline.stem,
        options: [],
        rawAnswer: inline.answer ?? "",
      };
      if (inline.answer) {
        flushDraft();
      }
      continue;
    }

    if (!draft) {
      draft = {
        type: activeType,
        stem: cleanupStem(line),
        options: [],
        rawAnswer: "",
      };
      continue;
    }

    draft.stem = appendText(draft.stem, cleanupStem(line));
  }

  flushDraft();

  const missingAnswerIds: string[] = [];
  const unknownTypeIds: string[] = [];
  const questions = drafts.map((item, index) => {
    const id = `${ID_PREFIX}-Q${String(index + 1).padStart(4, "0")}`;
    if (!item.rawAnswer) {
      missingAnswerIds.push(id);
    }
    if (!isKnownQuestionShape(item)) {
      unknownTypeIds.push(id);
    }

    return {
      id,
      courseId: COURSE_ID,
      index: index + 1,
      type: item.type,
      stem: item.stem,
      options: item.type === "judge" || item.type === "blank" ? [] : item.options,
      answer: normalizeAnswer(item.type, item.rawAnswer, item.stem),
      analysis: "",
    } satisfies Question;
  });

  return { questions, missingAnswerIds, unknownTypeIds };
}

function parseSectionHeading(line: string): QuestionType | null {
  const text = line.replace(/\s+/g, "");
  if (/^单选题$/.test(text)) {
    return "single";
  }
  if (/^多选题$/.test(text)) {
    return "multiple";
  }
  if (/^判断题$/.test(text)) {
    return "judge";
  }
  if (/^简答题$/.test(text)) {
    return "blank";
  }
  return null;
}

function parseAnswerLine(line: string): string | null {
  const match = line.match(/^(?:参考答案|正确答案|答案)\s*[:：]?\s*(.+)$/);
  return match ? match[1].trim() : null;
}

function parseOptionLine(line: string): QuestionOption | null {
  const match = line.match(/^([A-H])\s*[.．、]\s*(.+)$/i);
  if (!match) {
    return null;
  }
  return {
    label: match[1].toUpperCase(),
    text: match[2].trim(),
  };
}

function splitInlineShortAnswer(line: string): { stem: string; answer?: string } {
  const stem = cleanupStem(line);
  const match = stem.match(/^(.*?[？?])\s*([Pp]\s*\d+(?:\s*[-~—－]\s*[Pp]?\s*\d+)?)$/);
  if (!match) {
    return { stem };
  }
  return {
    stem: cleanupStem(match[1]),
    answer: normalizePageReference(match[2]),
  };
}

function normalizeAnswer(type: QuestionType, rawAnswer: string, stem = ""): AnswerValue {
  if (type === "single") {
    return normalizeOptionAnswer(rawAnswer)[0] ?? rawAnswer.trim();
  }
  if (type === "multiple") {
    return normalizeOptionAnswer(rawAnswer);
  }
  if (type === "judge") {
    return normalizeJudgeAnswer(rawAnswer) ?? rawAnswer.trim();
  }
  return normalizeShortAnswer(stem, rawAnswer);
}

function normalizeShortAnswer(stem: string, rawAnswer: string): string[] {
  const mappedAnswer = SHORT_ANSWERS_BY_STEM[stem];
  if (mappedAnswer) {
    return [mappedAnswer];
  }
  return rawAnswer.trim() ? [normalizePageReference(rawAnswer)] : [];
}

function normalizeOptionAnswer(rawAnswer: string): string[] {
  const matches = rawAnswer.toUpperCase().match(/[A-H]/g) ?? [];
  return Array.from(new Set(matches)).sort();
}

function normalizeJudgeAnswer(rawAnswer: string): string | null {
  const text = rawAnswer.trim().toLowerCase();
  if (/^(正确|对|是|true|t|yes|y|√|✓)$/.test(text)) {
    return "正确";
  }
  if (/^(错误|错|否|false|f|no|n|×|x)$/.test(text)) {
    return "错误";
  }
  return null;
}

function isKnownQuestionShape(question: DraftQuestion): boolean {
  if (question.type === "single") {
    return question.options.length > 0 && normalizeOptionAnswer(question.rawAnswer).length === 1;
  }
  if (question.type === "multiple") {
    return question.options.length > 0 && normalizeOptionAnswer(question.rawAnswer).length > 1;
  }
  if (question.type === "judge") {
    return normalizeJudgeAnswer(question.rawAnswer) !== null;
  }
  return question.stem.length > 0 && question.rawAnswer.trim().length > 0;
}

function stripAnswerPrefix(value: string): string {
  return value.replace(/^(?:参考答案|正确答案|答案)\s*[:：]?\s*/, "").trim();
}

function cleanupStem(value: string): string {
  return value
    .replace(/^\d+\s*[.．、]\s*/, "")
    .replace(/^\d+\s+(?=\S)/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function appendText(base: string, addition: string): string {
  return [base, addition.trim()].filter(Boolean).join(" ").trim();
}

function looksLikeQuestionStart(line: string): boolean {
  return /^\d+\s*[.．、]?\s*\S/.test(line) || /[？?]\s*(?:[Pp]\d+)?$/.test(line);
}

function normalizePageReference(value: string): string {
  return value
    .replace(/\s+/g, "")
    .replace(/[—－~]/g, "-")
    .replace(/^P/i, "p")
    .replace(/-P/i, "-p");
}

function countTypes(questions: Question[]): Record<QuestionType, number> {
  return questions.reduce(
    (counts, question) => {
      counts[question.type] += 1;
      return counts;
    },
    { single: 0, multiple: 0, judge: 0, blank: 0 },
  );
}