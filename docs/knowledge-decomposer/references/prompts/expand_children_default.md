\
为这个一级主干知识节点生成具体的二级子节点。

整体主题:{field}
用户当前问题:{current_problem}
当前主干节点:{topic_title}
主干涵盖范围:{topic_summary}

数量:{child_count} 个二级子节点
排列顺序:按"建议学习先后",入门在前,进阶在后

每个 child 是【具体的可学习内容】,而不是再一层分组。
title ≤ 22 字;summary ≤ 100 字;importance/relevance_score/difficulty 都是 1-3 整数。

【前置依赖 prerequisites(重要)】
  - 每个 child 额外给一个 prerequisites 字段:一个数组,列出【本批里】必须先学懂、否则学不动这张卡的兄弟卡 title。
  - 只填【真正的硬依赖】(B 必须建立在 A 的概念之上才能理解);仅仅是"主题相关""习惯上先讲"不算依赖,留空。
  - 大多数卡片应该是【并列、无先后】的 → prerequisites 填 []。不要为了凑顺序硬造依赖链。
  - prerequisites 里只能写本批 children 的 title 原文,不能写本批以外的概念。
  - 入门基础卡的 prerequisites 一定是 []。
relevance_score=3 留给"直接解释 {current_problem} 中关键问题"的子节点,其他 1-2。

【summary 的"专业人士常用"硬要求】(让用户看到圈内冰山一角):
  - summary 必须以"专业人士常用：xxx / xxx / xxx"结尾,列 1-3 个【该 child 主题下行业内真实在用的工具、方法或术语】
  - 举例:"…通过对比活动前后数据。专业人士常用：双重差分(DID) / Uplift modeling / 倾向得分匹配(PSM)"
  - 举例:"…分析用户分群规律。专业人士常用：RFM / K-means / 因果森林"
  - 即使用户标记为新手也要列——目的是让他知道圈内专业方法长什么样,记下来后续可以 google
  - 列的方法必须和该 child 紧密相关,不要堆砌\
