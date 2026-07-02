# 光伏题库导入校验报告

- 校验结果：PASS
- 导入源：raw\photovoltaic-operations\学习通光伏题库_审核清理版.csv
- 输出题库：src\data\questions\photovoltaic-operations.json
- 总题数：210
- 题型统计：single 78 / multiple 58 / judge 64 / blank 10

## 检查项

| 状态 | 检查项 | 详情 |
| --- | --- | --- |
| PASS | JSON 是否能被解析 | 210 records |
| PASS | 总题数是否为 210 | 210 |
| PASS | single 是否为 78 | 78 |
| PASS | multiple 是否为 58 | 58 |
| PASS | judge 是否为 64 | 64 |
| PASS | blank 是否为 10 | 10 |
| PASS | ID 是否唯一 | 210/210 |
| PASS | 是否有空题干 |  |
| PASS | 是否有空答案 |  |
| PASS | single 答案是否只有 1 个字母 |  |
| PASS | multiple 答案是否至少 2 个字母 |  |
| PASS | multiple 答案字符是否都能对应到选项 |  |
| PASS | judge 答案是否符合项目现有格式 | 正确/错误 |
| PASS | blank 答案是否为非空长文本 | blank=10 |
| PASS | 是否包含完整学习通 URL |  |
| PASS | 是否包含敏感参数字段或字符串 |  |
| PASS | 第 30 题是否 multiple + AB | multiple AB |
| PASS | 第 99 题是否不存在 |  |
| PASS | 10 道简答题是否存在 | 10 |
| PASS | courses.json 是否正确加入新课程，且没有重复课程 | 1 match |

## 关键题

第 1 题：PVOPS-S0001 / single / 答案 C。
第 30 题：PVOPS-M0030 / multiple / 答案 AB。
第 51 题：PVOPS-M0051 / multiple / 答案 ABC。
第 99 题：审核清理版 CSV 中未出现 sourceIndex=99，未进入最终题库。
第 138 题：PVOPS-J0138 / judge / 答案 错误。
第 201 题：PVOPS-J0201 / judge / 答案 错误。

