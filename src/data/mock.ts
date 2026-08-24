import type { Asset, Segment, Shot } from '@/types'

export const DEFAULT_BALANCE = 10096308

export const SAMPLE_SCRIPT = `第一场
时间：周六 中午 12:00
地点：客厅沙发

画面：
特写镜头。苏可蜷缩在沙发里，手机屏幕疯狂闪烁。
来电显示："健身教练–王（15）"。

动作：
苏可一脸"视死如归"，用脚趾把手机踢到了抱枕下面。
手机在抱枕下闷声震动。

苏可（碎碎念）：
"看不见我……你看不见我……我已经在跑步机上猝死了……"

动作：
震动停止。
苏可像土拨鼠一样从抱枕里探出头，确认安全。
她如释重负地瘫倒，刚想闭眼。

声音：
"叮咚——"
清脆的门铃声，在安静的房间里像防空警报。

动作：
苏可整个人原地弹起，动作敏捷地钻到了大毛绒熊后面躲着。

门外（外卖员喊声）：
"尾号 0617 的外卖！加辣加臭加炸蛋的那份！没人在家我拿走退单了啊？"`

// 分段（截图：3 段，标题/时长/原文真实，其余列占位 —）
export function sampleSegments(): Segment[] {
  return [
    {
      id: 's1',
      no: 1,
      title: '教练来电与逃避',
      dur: '15s',
      text: '特写镜头。苏可蜷缩在沙发里，手机屏幕疯狂闪烁。来电显示："健身教练–王（15）"。苏可一脸"视死如归"，用脚趾把手机踢到了抱枕下面。手机在抱枕下闷声震动。苏可（碎碎念）："看不见我……你看不见我……我已经在跑步机上猝死了……"',
    },
    {
      id: 's2',
      no: 2,
      title: '警报解除与突发门铃',
      dur: '15s',
      text: '震动停止。苏可像土拨鼠一样从抱枕里探出头，确认安全。她如释重负地瘫倒，刚想闭眼。声音："叮咚——"清脆的门铃声，在安静的房间里像防空警报。',
    },
    {
      id: 's3',
      no: 3,
      title: '躲避外卖员',
      dur: '15s',
      text: '苏可整个人原地弹起，动作敏捷地钻到了大毛绒熊后面躲着。门外（外卖员喊声）："尾号 0617 的外卖！加辣加臭加炸蛋的那份！没人在家我拿走退单了啊？"',
    },
  ]
}

// 资产（截图：2 角色 + 1 场景）
export function sampleAssets(): Asset[] {
  return [
    {
      id: 'a1',
      kind: 'char',
      name: '外卖员',
      importance: 'minor',
      alias: '',
      desc: '20–30岁男性，现代都市外卖骑手。体态偏瘦，因长期奔波略显疲惫。脸型瘦削，神情急躁。穿着标准的高饱和度（如亮黄色或蓝色）外卖骑手防风冲锋衣，材质带有轻微的反光和日常磨损感，头戴有透明面罩的骑手安全头盔。整体呈现出真实的现代都市打工人质感，符合其急躁催单的性格特征。',
      prompt:
        '一个20–30岁的男性外卖员，三视图角色参考图。他体态偏瘦，脸型瘦削，神情急躁且略带疲惫。穿着亮黄色的宽松防风冲锋衣制服，衣服材质有真实的褶皱和轻微磨损感，头戴同色系的骑手安全头盔。现代都市背景，写实摄影风格，高质量，全身/半身多视角，角色设计表，中性光照，细节清晰，真实感强。',
      imgState: 'none',
    },
    {
      id: 'a2',
      kind: 'char',
      name: '苏可',
      importance: 'major',
      alias: '',
      desc: '24岁女性，资深宅女与吃货。体态匀称略带婴儿肥，圆润的鹅蛋脸，素颜，表情慵懒且生动。',
      prompt:
        '一个24岁的年轻女性，资深宅女，三视图角色参考图。她体态微肉可爱，圆润的鹅蛋脸，素颜，表情慵懒且生动。她穿着一件超级宽松的浅灰色纯棉连帽卫衣，卫衣的帽子紧紧扣在头上，露出几缕略显凌乱的头发，下身穿宽松的居家裤。写实风格，高质量，角色设计表，中性光照，服装材质柔软厚实，细节清晰，纯色背景，真实感强。',
      imgState: 'none',
    },
    {
      id: 's_scene1',
      kind: 'scene',
      name: '客厅',
      importance: 'minor',
      alias: '',
      desc: '空景，无人物。现代都市单身公寓客厅，昏暗室内光线，窗帘紧闭。',
      prompt:
        'Empty scene, no people. Modern urban single apartment living room, dim indoor lighting, curtains tightly closed, revealing faint cool-toned skylight. In the midground to the right is a comfortable fabric sofa with several throw pillows scattered on it, showing obvious signs of use. A giant plush bear leans against the wall to the right rear of the sofa.',
      imgState: 'none',
      belongSegs: [1, 2, 3],
      roles: ['苏可', '外卖员'],
    },
  ]
}

// 分镜（截图：3 条，字段用截图真实文案）
export function sampleShots(): Shot[] {
  return [
    {
      id: 'sh1',
      no: 1,
      shot: '特写镜头，起幅包含苏可戴着卫衣帽子的面部与脚边闪烁的手机，随着她用脚趾踢手机的动作，镜头缓慢推向苏可面部（Push In），最终定格在她碎碎念的微表情上',
      timeline:
        '0–5秒：特写画面中，手机屏幕疯狂闪烁来电，苏可蜷缩在沙发里，卫衣帽子扣在头上，一脸视死如归。\n5–10秒：苏可用脚趾将手机踢到抱枕下面，手机在抱枕下闷声震动。\n10–15秒：镜头缓慢推向苏可面部，她躲在帽子里碎碎念自我催眠，嘴唇微动。',
      action: '蜷缩在沙发里，用脚趾把闪烁的手机踢到抱枕下，碎碎念自我催眠',
      anchor: '沙发及抱枕区域',
      motion: '苏可保持蜷缩姿态，仅腿部和脚趾发力将手机踢入抱枕下方，随后头部微缩进行碎碎念，无大范围空间位移',
      blocking: '苏可始终蜷缩在沙发上，手机位于脚边的抱枕附近',
      continuity: '苏可蜷缩在沙发的姿势，卫衣帽子扣在头上的状态，手机最终被隐藏在抱枕下的位置',
      subject: '苏可逃避健身教练的连环夺命 call',
      forbid: '禁止苏可摘下卫衣帽子，禁止手机离开抱枕下方',
      background: '昏暗的客厅背景，窗帘紧闭，视觉聚焦于沙发区域',
      done: true,
      video: { state: 'none', versions: [] },
    },
    {
      id: 'sh2',
      no: 2,
      shot: '中近景起幅，锁定沙发区域，拍摄苏可探头和瘫倒的动作；在门铃声响起时轻微一顿',
      timeline:
        '0–5秒：手机震动停止，苏可像土拨鼠一样从抱枕里探出头，确认安全。\n5–10秒：她如释重负地瘫倒在沙发上，刚想闭眼。\n10–15秒："叮咚——"清脆的门铃声突然响起，苏可身体一僵。',
      action: '从抱枕下探出头确认安全，向后瘫倒，随后被门铃声惊吓',
      anchor: '沙发及抱枕区域',
      motion: '起点：苏可埋在抱枕下；路径：向上探出头确认安全，随后身体向后瘫倒在沙发',
      blocking: '苏可位于客厅沙发上，身体被抱枕部分遮挡',
      continuity: '苏可瘫倒在沙发上的位置与姿态，抱枕的相对位置，以及卫衣帽子状态',
      subject: '苏可',
      forbid: '禁止房间光线变亮，禁止窗帘打开，禁止外界强光',
      background: '昏暗的客厅背景，窗帘紧闭，视觉聚焦于沙发区域',
      done: true,
      video: { state: 'none', versions: [] },
    },
    {
      id: 'sh3',
      no: 3,
      shot: '快速跟摇镜头。起幅对准沙发上的苏可，随其移动快速跟摇，落幅定格在大毛绒熊后探出的苏可',
      timeline:
        '0–5秒：苏可从沙发上整个人原地弹起，动作敏捷，朝大毛绒熊方向移动。\n5–10秒：苏可迅速钻到大毛绒熊后面躲避。\n10–15秒：门外传来外卖员的催单喊声。',
      action: '苏可从沙发原地弹起，迅速钻到大毛绒熊后面躲避',
      anchor: '大毛绒熊',
      motion: '苏可从沙发迅速起身，身体和视线明确朝向大毛绒熊移动，最终完全躲在熊后',
      blocking: '起点：沙发；终点：大毛绒熊后方',
      continuity: '大毛绒熊在画面中的位置和大小，苏可完全躲在熊后的状态',
      subject: '苏可',
      forbid: '禁止大毛绒熊的位置和外观发生变化，禁止苏可完全离开画面',
      background: '沙发区域与大毛绒熊所在区域',
      done: true,
      video: { state: 'none', versions: [] },
    },
  ]
}

// 一段渐变作为资产/视频缩略图占位（种子决定色相）
export function placeholderGradient(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  const h2 = (h + 40) % 360
  return `linear-gradient(135deg, hsl(${h} 45% 28%), hsl(${h2} 40% 16%))`
}
