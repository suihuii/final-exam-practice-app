import fs from "node:fs";
import path from "node:path";
import type { Question } from "../src/types";

const questionPath = path.resolve("src/data/questions/power-plant.json");

const imageByStem: Record<string, { image: string; imageAlt: string }> = {
  "什么是一次设备和二次设备？哪些设备属于一次设备？哪些设备属于二次设备？": {
    image: "question-images/power-plant-primary-secondary-equipment.svg",
    imageAlt: "一次设备位于主电路，二次设备通过测量、保护、控制和信号回路服务一次设备。",
  },
  "画出单母线分段接线的线路图，并简述其接线特点。": {
    image: "question-images/power-plant-single-bus-section.svg",
    imageAlt: "单母线分段接线示意图，两段母线通过分段断路器连接，各有进线和出线。",
  },
  "电流互感器和电压互感器的区别是什么？": {
    image: "question-images/power-plant-current-voltage-transformer.svg",
    imageAlt: "电流互感器串联在一次电路中，电压互感器并联在一次电路中。",
  },
  "画出一个半断路器接线的线路图，并简述其接线特点。": {
    image: "question-images/power-plant-one-and-half-breaker.svg",
    imageAlt: "一个半断路器接线示意图，每两个回路共用三个断路器。",
  },
};

const questions = JSON.parse(stripBom(fs.readFileSync(questionPath, "utf8"))) as Question[];
let updated = 0;

const enriched = questions.map((question) => {
  const image = imageByStem[question.stem.trim()];
  if (!image) {
    return question;
  }
  updated += 1;
  return {
    ...question,
    image: image.image,
    imageAlt: image.imageAlt,
  } satisfies Question;
});

fs.writeFileSync(questionPath, `${JSON.stringify(enriched, null, 2)}\n`, "utf8");
console.log(`发电厂题库题图补充: ${updated} 题`);
for (const [stem, image] of Object.entries(imageByStem)) {
  const question = enriched.find((item) => item.stem.trim() === stem);
  console.log(`${question?.id ?? "未找到"}: ${image.image}`);
}

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "");
}