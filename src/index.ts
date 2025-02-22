import { Context, Schema, Session, $, Permissions } from 'koishi'
import { } from 'koishi-plugin-adapter-onebot'
import { saohuaTalk } from './saohua'
import { link } from 'fs'

export const name = 'hadesstar-bot'
export const inject = ['database']

export interface Config { }

export const Config: Schema<Config> = Schema.object({})

//初始化各种变量
var defaultQQid = 0, defaultName = '巨蛇座星雲', defaultWaitDueTime = 20 * 6e4
var drs_number = 0, qqid = defaultQQid

declare module 'koishi' {
  interface Tables {
    players: Players
    dlines: DrsLines
  }
}

// 这里是新增表的接口类型
export interface Players {
  qid: number
  licence: number
  playRoutes: Array<number>
  techs: Array<number>
  group: string
}
export interface DrsLines {
  qid: number
  lineType: string
  waitDue: number
}

export function apply(ctx: Context) {

  // 初始化表players
  ctx.model.extend('players', {
    qid: {
      type: 'integer',
      length: 18,
      initial: 0,
      nullable: false,
    },
    licence: {
      type: 'integer',
      length: 2,
      initial: 6,
      nullable: false,
    },
    playRoutes: {
      type: 'array',
      initial: [0, 0, 0, 0, 0, 0],
      nullable: false,
    },
    techs: {
      type: 'array',
      initial: [0, 0, 0, 0],
      nullable: false,
    },
    group: {
      type: 'string',
      initial: '无集团',
      nullable: false,
    },
  }, {
    primary: 'qid',
    autoInc: false,
  })

  // 初始化表dlines
  ctx.model.extend('dlines', {
    qid: {
      type: 'integer',
      length: 18,
      initial: 0,
      nullable: false,
    },
    lineType: {
      type: 'string',
      length: 5,
      initial: 'K6',
      nullable: false,
    },
    waitDue: {
      type: 'integer',
      length: 32,
      initial: Date.now() + defaultWaitDueTime,
      nullable: false,
    },
  }, {
    primary: 'qid',
    autoInc: false,
  })

  //重置 cz
  ctx.command('cz', '重置数据表', { authority: 3 })
    .action(async (_) => {
      // 重置players及dlines
      ctx.database.drop('players')
      ctx.model.extend('players', {
        qid: {
          type: 'integer',
          length: 18,
          initial: 0,
          nullable: false,
        },
        licence: {
          type: 'integer',
          length: 2,
          initial: 6,
          nullable: false,
        },
        playRoutes: {
          type: 'array',
          initial: [0, 0, 0, 0, 0, 0],
          nullable: false,
        },
        techs: {
          type: 'array',
          initial: [0, 0, 0, 0],
          nullable: false,
        },
        group: {
          type: 'string',
          initial: '无集团',
          nullable: false,
        },
      }, {
        primary: 'qid',
        autoInc: false,
      })
      ctx.database.drop('dlines')
      ctx.model.extend('dlines', {
        qid: {
          type: 'integer',
          length: 18,
          initial: 0,
          nullable: false,
        },
        lineType: {
          type: 'string',
          length: 5,
          initial: 'K6',
          nullable: false,
        },
        waitDue: {
          type: 'integer',
          length: 32,
          initial: Date.now() + defaultWaitDueTime,
          nullable: false,
        },
      }, {
        primary: 'qid',
        autoInc: false,
      })
    })

  //调试 ts
  ctx.command('ts', '调试数据表', { authority: 3 })
    .action(async (_) => {
      console.clear()
      console.log('\n\nplayers数据如下:\n——————————')
      console.log(await ctx.database.get('players', { qid: { $gt: 0 } }))
      console.log('dlines数据如下:\n——————————')
      console.log(await ctx.database.get('dlines', { qid: { $gt: 0 } }))
    })

  //权限管理
  ctx.permissions.provide('authority:3', async (name, session) => {
    return session.onebot?.sender?.role === 'admin'
  })

  console.clear()

  saohuaTalk(ctx)

  //主监听用户输入
  ctx.on('message', async (session) => {

    //初始化会话监听
    qqid = getQQid(session)
    ctx.database.upsert('players', () => [{ qid: qqid }])

    //测试 cs
    ctx.command('cs', '', { authority: 2 })
      .action(async (_) => {
        // await session.sendQueued('ok')
        console.log(await showAllLines(ctx, session))
      })

    //加入三人组队 D<7-12>
    ctx.command('D <arg>')
      .alias('D7', { args: ['7'] }).alias('D8', { args: ['8'] }).alias('D9', { args: ['9'] })
      .alias('D10', { args: ['10'] }).alias('D11', { args: ['11'] }).alias('D12', { args: ['12'] })
      .action(async (_, arg) => {
        drs_number = +arg
        if (isValidDrsNum(drs_number)) {
          await join_drs(ctx, session, `D${drs_number}`)
        }
      })

    //加入双人组队 K<7-12>
    ctx.command('K <arg>')
      .alias('K7', { args: ['7'] }).alias('K8', { args: ['8'] }).alias('K9', { args: ['9'] })
      .alias('K10', { args: ['10'] }).alias('K11', { args: ['11'] }).alias('K12', { args: ['12'] })
      .action(async (_, arg) => {
        drs_number = +arg
        if (isValidDrsNum(drs_number)) {
          await join_drs(ctx, session, `K${drs_number}`)
        }
      })

    //退出组队 TC
    ctx.command('TC', '退出所有列队')
      .action(async (_) => { await quit_drs(ctx, session) })

    //查询组队情况 CK[7-12]
    ctx.command('CK [arg]', '查询组队情况 例: CK CK9')
      .alias('CK7', { args: ['7'] }).alias('CK8', { args: ['8'] }).alias('CK9', { args: ['9'] })
      .alias('CK10', { args: ['10'] }).alias('CK11', { args: ['11'] }).alias('CK12', { args: ['12'] })
      .action(async (_, arg) => {
        drs_number = +arg
        if (isNaN(drs_number)) {
          await session.sendQueued(await showAllLines(ctx, session))
        }
        else if (isValidDrsNum(drs_number)) {
          await session.sendQueued(await showALine(ctx, session, drs_number))
        }
      })

    //查询个人信息 CX[qqid]
    ctx.command('CX [arg]')
      .action(async (_, arg) => {
        let tmp: number
        if (arg == undefined) {
          tmp = qqid
        }
        else tmp = +arg
        if (!isNaN(tmp)) {
          await session.sendQueued(await formatted_playerdata(ctx, session, tmp))
        }
      })

    //更新信息 LR[科技/集团]
    ctx.command('LR <arg>', 'LR 创0富0延0强0')
      .action(async (_, arg) => {
        if (arg == undefined) return
        else if (arg.at(0) == '创' && arg.indexOf('富') != -1) {
          let genesis = +arg.substring(1, arg.indexOf('富')),
            enrich = +arg.substring(arg.indexOf('富') + 1, arg.indexOf('延')),
            rse = +arg.substring(arg.indexOf('延') + 1, arg.indexOf('强')),
            boost = +arg.substring(arg.indexOf('强') + 1)
          let techs_in = [genesis, enrich, rse, boost]
          if (!existNaN(genesis, enrich, rse, boost)) {
            await ctx.database.upsert('players', () => [{ qid: qqid, techs: techs_in }])
            await session.sendQueued(`已录入${await getTech(ctx, qqid)}`)
          }
        }
      })
    ctx.command('LR常驻集团 <arg>', 'LR常驻集团 巨蛇座星雲')
      .action(async (_, arg) => {
        if (arg == undefined) return
        else {
          let playerGroup = arg.trim()
          if (playerGroup != '') {
            await ctx.database.upsert('players', () => [{ qid: qqid, group: playerGroup }])
            await session.sendQueued(`已录入常驻集团 ${await getGroup(ctx, qqid)}`)
          }
        }
      })

    //授权车牌 SQ <qqid> <licence>
    ctx.command('SQ <arg:number> <arg2:string>', '授权车牌 SQ 114514 D9', { authority: 2 })
      .action(async (_, arg: number, arg2: string) => {
        //此处应该授权车牌
        let tmp = +(arg2.substring(1).trim())
        if (!isValidDrsNum(tmp)) {
          await session.sendQueued('请输入正确车牌数字<7-12>')
          return
        }
        await ctx.database.upsert('players', () => [{ qid: arg, licence: tmp }])
        await session.sendQueued(`已授予D${tmp}车牌————\n${await formatted_playerdata(ctx, session, arg)}`)
      })
  })
}

async function join_drs(ctx: Context, session: Session, joinType: string): Promise<void> {
  //检查车牌
  let lineLevel = (+joinType.substring(1))
  let driverLicence = await getLicence(ctx, qqid)
  if (driverLicence < lineLevel) {
    await session.sendQueued(`你未获得${joinType}车牌`)
    return
  }
  let foundType = await findDrsFromId(ctx, session, qqid)
  if (foundType == 'K0') {
    await ctx.database.upsert('dlines', () => [{ qid: qqid, lineType: joinType }])
    let dinfo = await findIdFromDrs(ctx, joinType)
    let lineNum = dinfo.length
    let lineMaximum = joinType.indexOf('K') != -1 ? 2 : 3
    var drs_message = `${session.author.name} 成功加入${joinType}队伍\n——————————————\n发车人数 [${lineNum}/${lineMaximum}]\n——————————————\n${await formatted_DrsN(ctx, session, joinType)}——————————————\n`

    //发车
    if (lineNum >= lineMaximum) {
      drs_message += `[如果小号进入请提前说明]\n[队伍已就绪我们在哪集合]\n[集团发车口令🔰  A${joinType.substring(1)}  ]`
      //发车后清空队伍
      for (const driverId of dinfo) {
        let tmp = (await ctx.database.get('players', { qid: driverId }))[0].playRoutes
        tmp[lineLevel - 7] += 1
        await ctx.database.upsert('players', () => [{ qid: qqid, playRoutes: tmp }])
      }
      await ctx.database.remove('dlines', { lineType: joinType })
    }
    else drs_message += drs_timer(joinType)
    await session.sendQueued(drs_message)
    return
  }
  else if (foundType == joinType)
    await session.sendQueued(`你已在${joinType}队伍中`)
  else {
    let drs_num = drs_number
    await quit_drs(ctx, session)
    drs_number = drs_num
    await join_drs(ctx, session, joinType)
  }
}

async function quit_drs(ctx: Context, session: Session): Promise<void> {
  let foundType = await findDrsFromId(ctx, session, qqid)
  if (foundType != 'K0') {
    await ctx.database.remove('dlines', { qid: qqid })
    await session.sendQueued(`${session.author.name} 已退出${foundType}队列`)
  }
  else await session.sendQueued("你未在队伍中")
}

async function findIdFromDrs(ctx: Context, checkType: string): Promise<number[]> {
  let dinfo = await ctx.database.get('dlines', { lineType: checkType })
  if (dinfo[0] == undefined) return []
  let foundIdList = []
  dinfo.forEach(element => {
    foundIdList.push(element.qid)
  });
  return foundIdList
}

async function findDrsFromId(ctx: Context, session: Session, playerId: number): Promise<string> {
  let dinfo = await ctx.database.get('dlines', { qid: playerId })
  if (dinfo[0] == undefined) return 'K0'
  else if (Date.now() >= dinfo[0].waitDue) {
    await ctx.database.remove('dlines', { qid: playerId })
    await session.sendQueued(`@${await getNameFromQid(ctx, session, playerId)} 超时被踢出${dinfo[0].lineType}队列`)
    return 'K0'
  }
  else return dinfo[0].lineType
}



async function formatted_DrsN(ctx: Context, session: Session, targetType: string): Promise<string> {
  let targetNum = +targetType.substring(1)
  let dinfo = await findIdFromDrs(ctx, targetType)
  if (dinfo.length == 0) return `${targetType}队列为空`
  let tmp = []
  let drs_message = ''
  for (const playerId of dinfo) {
    let playerName = await getNameFromQid(ctx, session, playerId)
    let playerRoute = await getPlayRoutes(ctx, playerId)
    let playerTech = await getTech(ctx, playerId)
    drs_message += `╔@${playerName}  ${playerRoute[targetNum - 7]}\n╚［${playerTech}]\n`
  }
  return drs_message
}

async function showAllLines(ctx: Context, session: Session): Promise<string> {
  let linesMsg = '', lineMsg: string, tmp: string
  for (var i = 7; i <= 12; i++) {
    lineMsg = ''
    tmp = await formatted_DrsN(ctx, session, `D${i}`)
    if (tmp.indexOf('队列为空') == -1) lineMsg += `D${i}队列—————\n${tmp}`
    tmp = await formatted_DrsN(ctx, session, `K${i}`)
    if (tmp.indexOf('队列为空') == -1) lineMsg += `K${i}队列—————\n${tmp}`
    linesMsg += lineMsg
  }
  if (linesMsg == '') return '所有队列为空'
  return linesMsg
}

async function showALine(ctx: Context, session: Session, lineNum: number): Promise<string> {
  return `D${lineNum}队列—————\n${await formatted_DrsN(ctx, session, `D${lineNum}`)}K${lineNum}队列—————\n${await formatted_DrsN(ctx, session, `K${lineNum}`)}`
}

async function getLicence(ctx: Context, playerId: number) {
  return (await ctx.database.get('players', { qid: playerId }, ['licence']))[0].licence
}

async function getPlayRoutes(ctx: Context, playerId: number) {
  return (await ctx.database.get('players', { qid: playerId }, ['playRoutes']))[0].playRoutes
}

async function getTech(ctx: Context, playerId: number) {
  let techs_get = (await ctx.database.get('players', { qid: playerId }, ['techs']))[0].techs
  return `创${techs_get[0]}富${techs_get[1]}延${techs_get[2]}强${techs_get[3]}`
}

async function getGroup(ctx: Context, playerId: number): Promise<string> {
  return (await ctx.database.get('players', { qid: playerId }, ['group']))[0].group
}

async function getNameFromQid(ctx: Context, session: Session, playerId: number): Promise<string> {
  if (!session.onebot) {
    // For test cases
    switch (playerId) {
      case 1: return 'Alice'
      case 2: return 'Bob'
      case 3: return 'Carol'
    }
    return defaultName
  }
  return (await session.onebot.getGroupMemberInfo(session.channelId, playerId)).nickname
}

async function formatted_playerdata(ctx: Context, session: Session, playerId: number): Promise<string> {
  return `@${session.author.name}\nQQ: ${playerId}\n场数: ${await getPlayRoutes(ctx, playerId)}\n科技: ${await getTech(ctx, playerId)}\n集团: ${await getGroup(ctx, playerId)}`
}

function drs_timer(targetType: string): string {
  return `这是一个显示踢出计时器的占位符`
}

function getQQid(session: Session): number {
  if (!session.onebot) {
    // For test cases
    switch (session.author.name) {
      case 'Alice': return 1
      case 'Bob': return 2
      case 'Carol': return 3
    }
    return defaultQQid
  }
  return +session.author.id
}

function isValidDrsNum(drs_num: number): boolean {
  return !isNaN(drs_num) && drs_num >= 7 && drs_num <= 12
}

function existNaN(...nums: number[]): boolean {
  nums.forEach(num => {
    if (isNaN(num)) return true
  });
  return false
}
