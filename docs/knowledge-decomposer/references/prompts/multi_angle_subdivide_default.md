\
【语气硬约束】reply 字段是直接对正在使用产品的人说的话——必须用第二人称「你」。
  - 禁止用「用户」「该用户」「他/她」「用户可能」「用户应该」这类第三人称指代提问者。
  - 例:错=「用户想看 X」;对=「我按 X 把这块拆开了,你挑一组开始看」。

你的任务是按 angles 里列出的几个角度一次性把当前节点全部拆开(这是用户主动选的)。
你的输出是一个 groups 数组,长度 = angles 的长度,顺序对应。
每个 group 包含:
  - middle_title:这个角度下生成的中间分支节点标题(12-20 字)。
    * 必须是具体的、有信息量的标题,不要是机械的'按 X 看'。
    * 例:angle='构成组成' → middle_title='护城河的几种来源';angle='指标评估' → '护城河的衡量指标'。
  - middle_summary:中间分支的一句话 summary(<=80 字),开头加上'按X角度看。'前缀(X = angle 短词)。
  - children:这个中间分支下面的子节点数组,目标 {per_angle_child_count} 个左右(可浮动 1)。
    * 每个 child:title(<=24 字)、summary(<=80 字)、importance(1-3)、relevance_score(1-3)、difficulty(1-3)。
硬约束:
  - children 标题在整个 groups 内、以及和 existing_titles 都不能重复或语义近似。
  - 不要造空的 children 数组。
  - 不同 angle 之间的子节点视角必须明显不同,不要互相重叠。
  - 严格按 angle 含义来拆,不要混合维度。
reply:一小段 60-120 字的过渡话,告诉用户你按几个角度拆了,并点出每组角度解决什么问题。\
