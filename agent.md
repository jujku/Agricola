你是一个资深桌游设计师和全栈工程师。

复刻一个经典桌游农场主（农家乐）网页版在线多人 。

目标：

2-6人在线联机。

第一版本只实现核心玩法。

不要加入职业卡。
不要加入次要发展卡。
不要加入扩展内容。

技术栈：

前端：
React
TypeScript
TailwindCSS
Zustand

后端：
Node.js
Express
Socket.io

数据库：
SQLite

玩法：

玩家拥有一个3×5农场。

资源：
木材
砖头
芦苇
小麦
蔬菜
食物

动物：
羊
猪
牛

建筑：
马厩
栅栏（每个玩家最多15个）
房屋（木头，砖头，石头）
农田
主要发展卡（10张）

标记：
乞讨卡（-3分）
起始玩家标记

每位玩家初始拥有：

2个工人（最多5个）
2个木房（在玩家农场的左下角，竖着，第一列的第二行，第三行）
起始玩家2个食物
非起始玩家3个食物

公共行动卡图版：

# Agricola Revised Edition 2016

## 重要原则

所有行动格必须包含：

- 名称
- 类型
- 消耗
- 收益
- 前置条件
- 执行规则
- 特殊限制

禁止在代码中通过规则书推断。

所有规则必须配置化。

---

# 初始行动格

## 森林（Forest）

类型：

资源积累

每轮补充：

3 木材

执行：

获得该格上全部木材

---

## 黏土坑（Clay Pit）

类型：

资源积累

每轮补充：

1 黏土

执行：

获得全部黏土

---

## 芦苇滩（Reed Bank）

类型：

资源积累

每轮补充：

1 芦苇

执行：

获得全部芦苇

---

## 捕鱼（Fishing）

类型：

资源积累

每轮补充：

1 食物

执行：

获得全部食物

---

## 打零工（Day Laborer）

执行：

获得 2 食物

---

## 农田（Farmland）

执行：

翻耕 1 块田地

规则：

从库存取一块田地板块

放置到农场空格

必须与已有田地正交相邻

第一块田没有相邻要求

---

## 谷物种子（Grain Seeds）

执行：

获得 1 谷物

---

## 农场扩建（Farm Expansion）

执行：

以下动作任选其一或同时执行：

1. 建房间
2. 建畜棚

---

### 建房间

当前木屋：

每个房间消耗：

5 木材
2 芦苇

当前黏土屋：

每个房间消耗：

5 黏土
2 芦苇

当前石屋：

每个房间消耗：

5 石头
2 芦苇

规则：

新房间必须与现有房间正交相邻

一次行动可建多个房间

---

### 建畜棚

每个畜棚消耗：

2 木材

规则：

一次行动最多建4个

每格最多1个畜棚

畜棚可单独存在

也可位于牧场内

---

## 课程（Lessons）

执行：

打出职业卡

费用：

第1张职业：

0食物

第2张职业：

1食物

第3张及以后：

2食物

---

## 广场

执行
可 获得起始玩家标记（下一回合第一个行动）
可 获得一个粮食
也可两种都执行

# 第一季行动卡

## 主要/次要发展卡

执行：

选择一项：

购买主要发展卡

或

打出次要发展卡

支付对应资源

---

## 围栏（Fencing）

执行：

建造任意数量围栏

消耗：

每段围栏 1 木材

规则：

必须形成完全封闭区域

形成后得到牧场

牧场必须连续

动物种类不可混养

---

## 播种与烤面包

Sow and/or Bake Bread

执行：

可播种

可烤面包

可两者都执行

---

### 播种

谷物：

支付：

1 谷物

获得：

将3谷物放入田地

其中：

1来自自己库存

2来自公共库存

---

蔬菜：

支付：

1 蔬菜

获得：

将2蔬菜放入田地

其中：

1来自自己库存

1来自公共库存

---

### 烤面包

必须拥有：

壁炉
灶台
烤炉

否则不能执行

转换比例由发展卡决定

---

## 羊市场

每轮补充：

1 羊

执行：

获得全部羊

必须有地方饲养

如果拿取的羊超过可饲养的数量，可以选择丢弃，或者通过主要发展卡做成食物

---

# 第二季行动卡

## 房屋翻修

House Redevelopment
前提条件，返修房屋必须全部房屋一起翻修

执行顺序：

1 翻修房屋

然后

2 购买主要发展卡

---

### 木屋 -> 黏土屋

消耗：

每个房间：

1 黏土

额外：

1 芦苇

示例：

3房间木屋

需要：

3黏土
1芦苇

---

### 黏土屋 -> 石屋

消耗：

每个房间：

1 石头

额外：

1 芦苇

---

---

## 西部采石场

每轮补充：

1 石头

执行：

获得全部石头

---

## 生孩子（需要空房）

Basic Wish for Children

前置条件：

空房间数量 >= 1

执行：

新增1家庭成员

新成员下轮开始可行动

---

# 第三季行动卡

## 蔬菜种子

获得：

1 蔬菜

---

## 野猪市场

每轮补充：

1 野猪

执行：

获得全部野猪

必须有地方饲养

如果拿取的野猪超过可饲养的数量，可以选择丢弃，或者通过主要发展卡做成食物

---

# 第四季行动卡

## 东部采石场

每轮补充：

1 石头

执行：

获得全部石头

---

## 牛市场

每轮补充：

1 牛

执行：

获得全部牛

必须有地方饲养

如果拿取的牛超过可饲养的数量，可以选择丢弃，或者通过主要发展卡做成食物

---

# 第五季行动卡

## 耕种

Cultivation

执行：

翻耕1块田

并且/或者

播种

---

## 紧急生孩子（不需要空房）

Basic Wish for Children

执行：

新增1家庭成员

新成员下轮开始可行动

# 第六季行动卡

## 最终翻修

Farm Redevelopment

执行顺序：

1 翻修房屋

2 建造围栏

---

# 动物容量规则

房屋：

最多养1只动物

---

无围栏畜棚：

最多养1只动物

---

1格牧场：

最多养2只同种动物

---

牧场+1畜棚：

容量翻倍

4只

---

牧场+2畜棚：

8只

---

牧场+3畜棚：

16只

---

牧场+4畜棚：

32只

---

不同动物禁止同牧场混养

---

# 收获阶段

发生于：

第4回合结束
第7回合结束
第9回合结束
第11回合结束
第13回合结束
第14回合结束

顺序：

1 收获田地

每块田取最上方1个作物

---

2 喂养家庭

每个家庭成员：

消耗2食物

---

3 动物繁殖

满足：

同种动物 >=2

获得：

1只幼崽

每种动物每次收获最多繁殖1只

必须有空间容纳
否则弃掉

接下来是回合流程和一些代码结构

# Agricola 2016 实现规范

## 核心原则

先实现完整规则引擎。

后实现UI。

React组件禁止直接修改游戏状态。

所有状态变更必须经过：

Action -> GameEngine -> State

---

# 游戏生命周期

WAITING

等待玩家加入

↓

SETUP

初始化游戏

↓

ROUND_PREPARE

翻开新的行动卡

补充积累资源

↓

WORK_PHASE

玩家轮流派遣家庭成员

↓

RETURN_HOME

家庭成员回家

↓

HARVEST

如果本轮需要收获

↓

NEXT_ROUND

进入下一轮

↓

GAME_END

结算

---

# 游戏主循环

Round 1

Preparation

↓

Work Phase

↓

Return Home

↓

Round 2

Preparation

↓

Work Phase

↓

Return Home

...

Round 4

Preparation

↓

Work Phase

↓

Return Home

↓

Harvest

↓

Round 5

...

游戏共14轮

Harvest发生于：

4
7
9
11
13
14

参考规则流程：
每轮先翻开新的行动卡，再补充所有积累格资源，然后进行工人放置；收获轮结束后执行田地收获、喂养和繁殖。

---

# Round Prepare

执行顺序

1

翻开本轮行动卡

加入公共行动区

2

所有积累格补充资源

例如：

Forest +3 Wood

Fishing +1 Food

Clay Pit +1 Clay

Reed Bank +1 Reed

Western Quarry +1 Stone

...

---

# Work Phase

开始玩家行动

当前玩家：

currentPlayerIndex

---

玩家放置家庭成员

placeWorker()

参数：

{
playerId,
workerId,
actionSpaceId
}

---

执行行动格效果

resolveAction()

---

切换下一玩家

nextPlayer()

---

直到：

所有玩家工人全部放完

---

结束Work Phase

---

# Return Home

所有工人返回玩家农场

occupied = false

worker.location = home

---

如果本轮不是Harvest

进入下一轮

---

如果本轮是Harvest

进入Harvest

---

# Harvest

Harvest共有3个阶段

---

第一阶段

Field Phase

---

每块田地收获1个作物

for each field

grain--

or

vegetable--

加入玩家库存

规则来源于收获阶段定义。

---

第二阶段

Feeding Phase

---

每个家庭成员

消耗2食物

例：

2人家庭

需要4食物

3人家庭

需要6食物

4人家庭

需要8食物

---

食物不足

触发Begging Card

每缺1食物

获得1张乞讨卡

最终得分

-3分

---

第三阶段

Breeding Phase

---

羊 >=2

获得1羊

---

野猪 >=2

获得1野猪

---

牛 >=2

获得1牛

---

每种动物

每次收获最多繁殖1只

---

必须有容量容纳

否则幼崽消失

收获顺序和繁殖规则均按官方流程实现。

---

# Game End

Round 14 Harvest结束

立即结算

---

# 推荐代码架构

src/

engine/

GameEngine.ts

RoundManager.ts

ActionResolver.ts

HarvestManager.ts

ScoringManager.ts

CardManager.ts

AnimalManager.ts

FarmManager.ts

---

state/

GameState.ts

PlayerState.ts

FarmState.ts

ActionSpaceState.ts

CardState.ts

---

config/

baseActions.ts

roundCards.ts

majorImprovements.ts

occupations.ts

minorImprovements.ts

scoringRules.ts

---

network/

socketServer.ts

socketEvents.ts

---

ui/

Board

Farm

ActionSpace

Cards

Resources

---

# GameState

interface GameState {

gameId

phase

round

stage

players

actionSpaces

roundCards

currentPlayer

startingPlayer

}

---

# 玩家状态

interface PlayerState {

id

resources

animals

workers

occupations

minorImprovements

majorImprovements

farm

beggingCards

score

}

---

# Socket事件

CREATE_ROOM

JOIN_ROOM

START_GAME

PLACE_WORKER

PLAY_OCCUPATION

PLAY_IMPROVEMENT

BUILD_ROOMS

BUILD_FENCES

RENOVATE

FAMILY_GROWTH

END_ACTION

SYNC_STATE

---

# 最重要要求

GameEngine必须纯逻辑。

React不能包含规则。

React只负责显示状态。

所有规则全部写在Engine层。

未来职业卡

次要发展卡

主要发展卡

扩展包

都通过事件系统注册。

禁止：

if(cardId == xxx)

这种写法。

必须采用：

EventBus

Trigger

Effect

配置驱动架构。

游戏结束

游戏在：

Round 14

Harvest

全部完成后结束。

执行：

calculateFinalScore()

计分原则

最终得分 =

农场得分

房屋得分

家庭成员得分

围栏畜棚得分

发展卡得分

职业卡得分

奖励分

空地扣分

乞讨卡扣分

田地（Fields）

统计：

fieldCount

计分表：

0-1块田地 = -1分

2块田地 = 1分

3块田地 = 2分

4块田地 = 3分

5块及以上 = 4分

牧场（Pastures）

统计：

pastureCount

注意：

统计牧场数量

不是牧场格数

计分表：

0个牧场 = -1分

1个牧场 = 1分

2个牧场 = 2分

3个牧场 = 3分

4个及以上 = 4分

谷物（Grain）

统计：

库存谷物

田地中的谷物

计分表：

0 = -1分

1~3 = 1分

4~5 = 2分

6~7 = 3分

8以上 = 4分

蔬菜（Vegetables）

统计：

库存蔬菜

田地中的蔬菜

计分表：

0 = -1分

1 = 1分

2 = 2分

3 = 3分

4以上 = 4分

羊（Sheep）

计分表：

0 = -1分

1~3 = 1分

4~5 = 2分

6~7 = 3分

8以上 = 4分

野猪（Boar）

计分表：

0 = -1分

1~2 = 1分

3~4 = 2分

5~6 = 3分

7以上 = 4分

牛（Cattle）

计分表：

0 = -1分

1 = 1分

2~3 = 2分

4~5 = 3分

6以上 = 4分

房屋

木屋

每房间：

0分

黏土屋

每房间：

1分

石屋

每房间：

2分

家庭成员

每个家庭成员：

3分

包括：

初始2人

以及后续出生成员

围栏中的畜棚

统计：

位于牧场内部的畜棚

每个：

1分

最高：

4分

空地

统计：

未使用农场格

定义：

没有房间

没有田地

没有牧场

没有独立畜棚

计分：

每格

-1分

乞讨卡

Begging Card

每张：

-3分

主要发展卡

统计：

majorImprovements

读取：

victoryPoints

直接加分

次要发展卡

统计：

minorImprovements

读取：

victoryPoints

直接加分

职业卡

统计：

occupationCards

读取：

bonusPoints

直接加分

计分结构

interface ScoreBreakdown {

fields

pastures

grain

vegetables

sheep

boar

cattle

rooms

family

fencedStables

majorImprovements

minorImprovements

occupations

emptySpaces

beggingCards

total

}

推荐实现

function calculateFinalScore(
player
){

return {

fields,

pastures,

grain,

vegetables,

sheep,

boar,

cattle,

rooms,

family,

fencedStables,

majorImprovements,

minorImprovements,

occupations,

emptySpaces,

beggingCards,

total

}

}

UI要求

游戏结束后显示：

玩家名称

总分

详细得分表

示例

辛禹杉

总分：

43

田地：
4

牧场：
3

谷物：
2

蔬菜：
3

羊：
2

野猪：
2

牛：
4

房屋：
6

家庭：
12

畜棚：
2

发展卡：
5

职业卡：
4

空地：
-3

乞讨卡：
-3

最终：

43

---

# 平局规则

如果总分相同：

比较剩余建筑资源：

木材

黏土

芦苇

石头

总和更高者获胜。

如果仍相同：

共同胜利。

主要发展卡（Major Improvements）

全局共10张。

所有玩家共享。

每张卡只能被获得一次。

例外：

壁炉 ×2
灶台 ×2

Fireplace A

名称：

壁炉（Fireplace）

费用：

2 黏土

胜利点：

1

效果

任何时候均可执行：

1 蔬菜 -> 2 食物

1 羊 -> 2 食物

1 野猪 -> 2 食物

1 牛 -> 3 食物

执行Bake Bread时：

1 谷物 -> 2 食物

不限次数

Fireplace B

名称：

壁炉（Fireplace）

费用：

3 黏土

胜利点：

1

效果与上面完全相同

Cooking Hearth A

名称：

灶台（Cooking Hearth）

费用：

4 黏土

或者

归还一个壁炉

胜利点：

1

任何时候均可执行：

1 蔬菜 -> 3 食物

1 羊 -> 2 食物

1 野猪 -> 3 食物

1 牛 -> 4 食物

Bake Bread：

1 谷物 -> 3 食物

不限次数

Cooking Hearth B

名称：

灶台（Cooking Hearth）

费用：

5 黏土

或者

归还一个壁炉

胜利点：

1

效果与上面完全相同

Clay Oven

名称：

陶土烤炉

费用：

3 黏土

1 石头

胜利点：

2

建造后：

立即获得一次

Bake Bread

Bake Bread效果：

1 次

1 谷物 -> 5 食物

注意：

一次Bake Bread行动

只能使用一次

Stone Oven

名称：

石头烤炉

费用：

1 黏土

3 石头

胜利点：

3

建造后：

立即获得一次

Bake Bread

Bake Bread效果：

最多执行2次

每次：

1 谷物 -> 4 食物

例如：

2谷物

可变为

8食物

Joinery

名称：

木工坊

费用：

2 木材

2 石头

胜利点：

2

Harvest阶段：

可执行一次：

1 木材 -> 2 食物

游戏结束时：

可消耗剩余木材换分

0~2木材：

0分

3~4木材：

1分

5~6木材：

2分

7木材以上：

3分

Pottery

名称：

陶器坊

费用：

2 黏土

2 石头

胜利点：

2

Harvest阶段：

可执行一次：

1 黏土 -> 2 食物

游戏结束时：

可消耗剩余黏土换分

0~2：

0分

3~4：

1分

5~6：

2分

7以上：

3分

Basketmaker's Workshop

名称：

编织工坊

费用：

2 芦苇

2 石头

胜利点：

2

Harvest阶段：

可执行一次：

1 芦苇 -> 3 食物

游戏结束时：

可消耗剩余芦苇换分

0~1：

0分

2~3：

1分

4~5：

2分

6以上：

3分

Well

名称：

水井

费用：

1 木材

3 石头

胜利点：

4

建造时：

在未来5个尚未翻开的回合位置

各放置1食物

这些回合开始时：

获得对应食物

总计获得：

5食物

事件系统

所有主要发展卡必须注册事件

Fireplace

监听：

ON_COOK

ON_BAKE_BREAD

Cooking Hearth

监听：

ON_COOK

ON_BAKE_BREAD

Clay Oven

监听：

ON_BUILD

ON_BAKE_BREAD

Stone Oven

监听：

ON_BUILD

ON_BAKE_BREAD

Joinery

监听：

ON_HARVEST

ON_GAME_END

Pottery

监听：

ON_HARVEST

ON_GAME_END

BasketmakerWorkshop

监听：

ON_HARVEST

ON_GAME_END

Well

监听：

ON_BUILD

ON_ROUND_START

Agent实现要求

禁止：

if(cardId=="joinery")

if(cardId=="well")

必须：

CardEffect

Trigger

Condition

Effect

注册机制

推荐结构

MajorImprovementDefinition

{

id

name

cost

victoryPoints

trigger[]

effect[]

}

玩家获得发展卡时：

registerCardEffects()

事件触发时：

EventBus.dispatch()

对应发展卡自动响应

这样未来职业卡和次要发展卡复用同一套架构。

这里面最容易被 Agent 写错的地方有三个：

灶台（Cooking Hearth）可以直接用壁炉升级，不必支付4/5黏土。
陶土烤炉一次烤面包行动只能把1个谷物变5食物。石头烤炉一次行动最多处理2个谷物。
木工坊、陶器坊、编织工坊在游戏结束时会把剩余资源转换成额外分数。

注意，游戏根据玩家数的不同还有扩展的初始行动格。

# 两人时增加一个格子（这个格子只能被一个工人使用）

以下4个行动任选一种

## Copse

积累：
每回合增加1个木头
执行：
拿走所有木头

## Modest wish for children

前置条件：
回合数 >= 5
空房间数量 >= 1

执行：

新增1家庭成员

新成员下轮开始可行动

## Resource Market

执行：
获得一个石头加一个粮食

## Animal Market

三个选项执行一个
获得一个羊+一个粮食
获得一个猪
获得一个牛+丢掉一个粮食

# 3-4个玩家时增加下面这个格子（只能被一个工人使用）

以下两个行动任选一种

## Animal Market

三个选项执行一个
获得一个羊+一个粮食
获得一个猪
获得一个牛+丢掉一个粮食

## Modest wish for children

前置条件：
回合数 >= 5
空房间数量 >= 1

执行：

新增1家庭成员

新成员下轮开始可行动

# 5个玩家时增加下面9个格子

## 这个格子两个选项选一个

### 课程（Lessons）

执行：

打出职业卡

费用：

2食物

---

### Copse

积累：
每回合增加1个木头
执行：
拿走所有木头

---

## Grove

积累：
每回合增加2个木头
执行：
拿走所有木头

---

## RiverBank Forest

积累：
每回合增加1个木头和一个芦苇
执行：
拿走所有资源

## 这个格子两个选项选一个

### 课程（Lessons）

执行：

打出职业卡

费用：

第1张职业：

0食物

第2张职业：

1食物

第3张及以后：

2食物

---

### Modest wish for children

前置条件：
回合数 >= 5
空房间数量 >= 1

执行：

新增1家庭成员

新成员下轮开始可行动

---

## Animal Market

三个选项执行一个
获得一个羊+一个粮食
获得一个猪
获得一个牛+丢掉一个粮食

---

## Resource Market

获得一个芦苇，一个石头，一个木头

## Hollow

积累：
每回合增加3个砖头
执行：
拿走所有砖头

## 这个格子两个选项选一个

### 建房间

当前木屋：

每个房间消耗：

5 木材
2 芦苇

当前黏土屋：

每个房间消耗：

5 黏土
2 芦苇

当前石屋：

每个房间消耗：

5 石头
2 芦苇

规则：

新房间必须与现有房间正交相邻

一次行动可建多个房间

---

### Traveling Players

积累：
每回合增加1个粮食
执行：
拿走所有粮食

# 6个玩家时增加下面5个格子

## Farming Supplies

可 一个食物换一个小麦（可叠加如3个食物换3个小麦）
可 一个食物耕种一块田 （可叠加）
可两者一起执行

## Builing Supplies

    获得：
    一个芦苇或石头，一个木头或砖头，一个粮食

## corral

    可增加一只没有的动物。
    如你有羊，你可以在猪和牛中选一只。

## side job

    可 花费一个木头建筑一个马厩 同建筑马厩
    可 烤面包
    可两者一起执行

## Improvement

    打出一张次要发展卡，并支付费用
    或者
    前提条件（在第五回合后（包括第五回合）），购买一张主要发展卡。

# 注意 扩展行动格是“累加式”的

4个玩家时，不仅有3-4人的扩展，还会加上2人扩展。5名玩家和6名玩家同理。意思就是6名玩家就要加上所有拓展。
2-6人扩展逻辑（关键）

必须写死在配置，而不是代码逻辑：

const actionPool = actions.filter(a =>
a.playerCounts.includes(playerCount)
)

禁止：

if(playerCount === 5) { ... }
回合生成规则（重点）
每回合：
从 roundDeck 抽1张 actionCard
push 到 board.actionSpaces
不删除旧卡
永久存在
最终结构建议
engine/
ActionEngine.ts
RoundEngine.ts

config/
baseActions.ts
playerExpandActions.ts
roundCards.ts
核心思想（给 Agent 的最后一句）

所有规则必须做到：

游戏 = 数据结构 + 事件系统
不允许规则写在 UI 或 if-else 中

另外还有一件最重要的事情 职业卡和次要发展卡，在这个版本还会开发，但并不表示，涉及到职业卡，和次要发展卡的行动格子就不开发，而且代码中还要给未开发的职业卡和次要发展卡，留接口和函数，只不过被调用时，内容可以为提醒玩家这个卡还会开放。
