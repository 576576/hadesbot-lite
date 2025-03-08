import { Context, Schema, Session, Tables, $, FlatPick } from 'koishi'
import { } from 'koishi-plugin-adapter-onebot'
import { } from '@koishijs/plugin-adapter-qq'

export const name = 'hadesbot-lite'
export const inject = ['database']

export interface Config {
  adminList?: string[]
  rsEventGroupName?: string
  drsWaitTime?: number
}

export const Config: Schema<Config> = Schema.object({
  drsWaitTime: Schema.number().description('每个玩家在超时前等待的时间 ms').default(18e5)
})

//初始化各种变量
var rs_event_status: boolean

declare module 'koishi' {
  interface Tables {
    players: Players
    dlines: DrsLines
    elines: RsEventLines
    erank: RsEventRanking
  }
}

// 这里是新增表的接口类型
export interface Players {
  qid: string
  openId?: string
  cachedName?: string
  licence: number
  playRoutes: Array<number>
  techs: Array<number>
  group: string
}
export interface DrsLines {
  qid: string
  lineType: string
  waitDue: number
}
export interface RsEventLines {
  qid: string
  runScore: number
  lineId: number
  lineType: string
}
export interface RsEventRanking {
  qid: string
  totalScore: number
  totalRuns: number
}

export function apply(ctx: Context, config: Config) {

  initPlayerTables()
  initRsEventTables()

  //权限管理
  ctx.permissions.provide('authority:2', async (name, session) => {
    return session.onebot?.sender?.role === 'owner' || session.onebot?.sender?.role === 'admin'
  })
  ctx.permissions.provide('authority:2', async (name, session) => {
    return config.adminList.includes(session.userId)
  })

  function initPlayerTables() {
    // 初始化表players
    ctx.model.extend('players', {
      qid: {
        type: 'string',
        length: 18,
        initial: '0',
        nullable: false,
      },
      openId: {
        type: 'string',
        initial: null,
        nullable: false,
      },
      cachedName: {
        type: 'string',
        initial: `使用LR名字录入`,
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
        type: 'string',
        length: 18,
        initial: '0',
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
        initial: Date.now() + config.drsWaitTime,
        nullable: false,
      },
    }, {
      primary: 'qid',
      autoInc: false,
    })
  }

  function initRsEventTables() {
    //初始化表elines
    ctx.model.extend('elines', {
      qid: {
        type: 'string',
        length: 18,
        initial: '0',
        nullable: false,
      },
      runScore: {
        type: 'integer',
        length: 8,
        initial: 0,
        nullable: false,
      },
      lineId: {
        type: 'integer',
        initial: 0,
        nullable: false,
      },
    }, {
      primary: 'lineId',
      autoInc: true,
    })

    // 初始化表erank
    ctx.model.extend('erank', {
      qid: {
        type: 'string',
        length: 18,
        initial: '0',
        nullable: false,
      },
      totalScore: {
        type: 'integer',
        length: 8,
        initial: 0,
        nullable: false,
      },
      totalRuns: {
        type: 'integer',
        initial: 0,
        nullable: false,
      },
    }, {
      primary: 'qid',
      autoInc: false,
    })
  }

  //主监听用户输入
  ctx.on('message', async (session) => {

    console.log(`\n${session.userId}: ${session.content}`)

    // //骚话模块
    // let isToSaohua = (Math.random() >= 0.95)
    // if (isToSaohua) saohuaTalk(session)

  })

  //加入三人组队 D<7-12>
  ctx.command('D <arg>')
    .alias('D7', { args: ['7'] }).alias('D8', { args: ['8'] }).alias('D9', { args: ['9'] })
    .alias('D10', { args: ['10'] }).alias('D11', { args: ['11'] }).alias('D12', { args: ['12'] })
    .action(async ({ session }, arg) => {
      let isInit = await isInitialized(session)
      if (!isInit) {
        session.send(`请使用CSH (qq号)初始化`)
        return
      }
      if (isValidDrsNum(+arg)) {
        await join_drs(session, `D${arg}`)
        return
      }
      session.send('请输入正确队列数字7-12')
    })

  //加入双人组队 K<7-12>
  ctx.command('K <arg>')
    .alias('K7', { args: ['7'] }).alias('K8', { args: ['8'] }).alias('K9', { args: ['9'] })
    .alias('K10', { args: ['10'] }).alias('K11', { args: ['11'] }).alias('K12', { args: ['12'] })
    .action(async ({ session }, arg) => {
      let isInit = await isInitialized(session)
      if (!isInit) {
        session.send(`请使用CSH (qq号)初始化`)
        return
      }
      if (isValidDrsNum(+arg)) {
        await join_drs(session, `K${arg}`)
        return
      }
      session.send('请输入正确队列数字7-12')
    })

  //退出组队 TC
  ctx.command('TC', '退出所有列队')
    .action(async ({ session }) => {
      await quit_drs(session)
    })

  //查询组队情况 CK[7-12]
  ctx.command('CK [arg]', '查询组队情况 例: CK CK9')
    .alias('CK7', { args: ['7'] }).alias('CK8', { args: ['8'] }).alias('CK9', { args: ['9'] })
    .alias('CK10', { args: ['10'] }).alias('CK11', { args: ['11'] }).alias('CK12', { args: ['12'] })
    .action(async ({ session }, arg) => {
      if (isValidDrsNum(+arg)) {
        await session.send(await showALine(session, +arg))
      }
      else await session.send(await showAllLines(session))
    })

  //查询个人信息 CX[userId]
  ctx.command('CX [userId]')
    .action(async ({ session }, userId) => {
      let qqid = await getQQid(session, userId, true)
      if (!qqid) return
      let isInit = await isInitialized(session, qqid)

      console.log(`${await getQQid(session)}: 试图查询${qqid}信息`)
      if (!qqid || !isInit) session.send('玩家信息未初始化\n请使用CSH 指令自助初始化')
      else session.send(await formatted_playerdata(session, qqid))
    })

  //更新信息 LR名字
  ctx.command('LR名字 <nick> [playerId]')
    .alias('LR账号')
    .action(async ({ session }, nick, playerId?) => {
      if (playerId != undefined && !isAdmin(session)) {
        session.send('无管理权限')
        return
      }
      let qqid = await getQQid(session, playerId, true)
      if (!qqid) return

      if (!nick) {
        session.send('请录入正确名字格式\n例: LR名字 高声豪歌')
        return
      }
      else {
        await ctx.database.upsert('players', () => [{ qid: qqid, cachedName: nick }])
        await session.send(`已录入名字 ${await getUserName(session, qqid)}`)
      }
    })

  console.clear()

  async function join_drs(session: Session, joinType: string): Promise<void> {
    let qqid = await getQQid(session, undefined, true)
    if (!qqid) return

    console.log(`\n${qqid}: 尝试加入${joinType}队伍`)
    let lineLevel = (+joinType.substring(1))

    let foundType = await findDrsFromId(session, qqid)
    if (foundType == 'K0') {
      await ctx.database.upsert('dlines', () => [{ qid: qqid, lineType: joinType }])
      let timer = await drs_timer(session, joinType)
      let dinfo = await findIdFromDrs(joinType)
      let lineNum = dinfo.length
      let lineMaximum = joinType.includes('K') ? 2 : 3
      var drs_message = `${session.onebot ? session.author.nick : ''} 成功加入${joinType}队伍\n————————————\n发车人数 [${lineNum}/${lineMaximum}]\n————————————\n${await formatted_DrsN(session, joinType, true)}————————————\n`

      //发车
      if (lineNum >= lineMaximum) {
        drs_message += `[如果小号进入请提前说明]\n[队伍已就绪我们在哪集合]\n[集团发车口令🔰  A${joinType.substring(1)}  ]`
        //发车后清空队伍并更新场次
        for (const driverId of dinfo) {
          let tmp = (await ctx.database.get('players', { qid: driverId }))[0].playRoutes
          tmp[lineLevel - 7] += 1
          await ctx.database.upsert('players', () => [{ qid: driverId, playRoutes: tmp }])
        }
        await ctx.database.remove('dlines', { lineType: joinType })
      }
      else drs_message += timer
      await session.send(drs_message)
      return
    }
    else if (foundType == joinType)
      await session.send(`${await getUserName(session, qqid)} 你已在${joinType}队伍中\n————————————\n${await formatted_DrsN(session, joinType)}————————————\n${await drs_timer(session, joinType)}`)
    else {
      await quit_drs(session)
      await join_drs(session, joinType)
    }
  }

  async function quit_drs(session: Session): Promise<void> {
    let qqid = await getQQid(session, undefined, true)
    if (!qqid) return

    let foundType = await findDrsFromId(session, qqid)
    if (foundType != 'K0') {
      await ctx.database.remove('dlines', { qid: qqid })
      await session.send(`${await getUserName(session, qqid)} 已退出${foundType}队列`)
    }
    else await session.send("你未在队伍中")
  }

  async function findIdFromDrs(checkType: string): Promise<string[]> {
    let dinfo = await ctx.database.get('dlines', { lineType: checkType })
    if (dinfo[0] == undefined) return []
    let foundIdList = []
    dinfo.forEach(element => {
      foundIdList.push(element.qid)
    });
    return foundIdList
  }

  async function findWaitFromDrs(session: Session, checkType: string): Promise<string[]> {
    let dinfo = await ctx.database.get('dlines', { lineType: checkType })
    if (dinfo[0] == undefined) return []
    let foundTimeList: string[] = []
    for (const element of dinfo) {
      let waitTimeLeft = element.waitDue - Date.now()
      if (waitTimeLeft <= 0) {
        await ctx.database.remove('dlines', { qid: element.qid })
        await session.send(`${await getUserName(session, element.qid)} 超时被踢出${dinfo[0].lineType}队列`)
        continue
      }
      let formatted_time = `⏱️${Math.floor(waitTimeLeft / 6e4)}:${('' + Math.floor((waitTimeLeft % 6e4) / 1e3)).padStart(2, '0')} `
      foundTimeList.push(formatted_time)
    }
    return foundTimeList
  }

  async function findDrsFromId(session: Session, playerId: string): Promise<string> {
    let qqid = await getQQid(session, playerId)
    if (!qqid) return 'K0'

    let dinfo = await ctx.database.get('dlines', { qid: qqid })
    if (dinfo[0] == undefined) return 'K0'
    else if (Date.now() >= dinfo[0].waitDue) {
      await ctx.database.remove('dlines', { qid: qqid })
      await session.send(`${await getUserName(session, qqid)} 超时被踢出${dinfo[0].lineType}队列`)
      return 'K0'
    }
    else return dinfo[0].lineType
  }

  async function formatted_DrsN(session: Session, targetType: string, isTryAt?: boolean): Promise<string> {
    let targetNum = +targetType.substring(1) - 7
    let dinfo = await findIdFromDrs(targetType)
    if (dinfo.length == 0) return `${targetType}队列为空`
    let drs_message = ''
    for (const playerId of dinfo) {
      let playerName = await getUserName(session, playerId, isTryAt)
      let playerRoute = await getPlayRoutes(playerId)
      let playerTech = await getTech(playerId)
      let playerGroup = await getGroup(playerId)
      drs_message += `╔ ${playerName}\n╠ [${playerGroup}] ${playerRoute[targetNum]}\n╚ [${playerTech}]\n`
    }
    return drs_message
  }

  async function showAllLines(session: Session): Promise<string> {
    let linesMsg = ((!session.onebot) ? '-\n' : ''), lineMsg: string, dinfo: string[]
    for (var i = 7; i <= 12; i++) {
      lineMsg = ''
      dinfo = await findIdFromDrs(`D${i}`)
      if (dinfo.length != 0) lineMsg += `D${i}队列—————\n${(await formatted_DrsN(session, `D${i}`))}${await drs_timer(session, `D${i}`)}\n`
      dinfo = await findIdFromDrs(`K${i}`)
      if (dinfo.length != 0) lineMsg += `K${i}队列—————\n${(await formatted_DrsN(session, `K${i}`))}${await drs_timer(session, `K${i}`)}\n`
      linesMsg += lineMsg
    }
    if (linesMsg == ((!session.onebot) ? '-\n' : '')) return '所有队列为空'
    else linesMsg += '————————\n其余队列为空'
    return linesMsg
  }

  async function showALine(session: Session, lineNum: number): Promise<string> {
    let lineMsg = ((!session.onebot) ? '-\n' : ''), dinfo: string[]
    dinfo = await findIdFromDrs(`D${lineNum}`)
    if (dinfo.length != 0) lineMsg += `D${lineNum}队列—————\n${(await formatted_DrsN(session, `D${lineNum}`))}${await drs_timer(session, `D${lineNum}`)}\n`
    dinfo = await findIdFromDrs(`K${lineNum}`)
    if (dinfo.length != 0) lineMsg += `K${lineNum}队列—————\n${(await formatted_DrsN(session, `K${lineNum}`))}${await drs_timer(session, `K${lineNum}`)}\n`
    if (!lineMsg.includes('队列')) lineMsg += `D${lineNum}/K${lineNum}队列为空`
    return lineMsg
  }

  async function getUserInfos(playerId: string): Promise<Pick<Players, 'licence' | 'playRoutes' | 'techs' | 'group' | 'cachedName'>> {
    return (await ctx.database.get('players', { qid: playerId }, ['licence', 'playRoutes', 'techs', 'group', 'cachedName']))[0]
  }

  async function getLicence(playerId: string): Promise<number> {
    return (await ctx.database.get('players', { qid: playerId }, ['licence']))[0].licence
  }

  async function getPlayRoutes(playerId: string): Promise<number[]> {
    return (await ctx.database.get('players', { qid: playerId }, ['playRoutes']))[0].playRoutes
  }

  async function getTech(playerId: string): Promise<string> {
    let techs_get = (await ctx.database.get('players', { qid: playerId }, ['techs']))[0].techs
    if (techs_get[0] == 0 && techs_get[1] == 0 && techs_get[2] == 0 && techs_get[3] == 0) return '科技未录入'
    return `创${techs_get[0]}富${techs_get[1]}延${techs_get[2]}强${techs_get[3]}`
  }

  async function getGroup(playerId: string): Promise<string> {
    return (await ctx.database.get('players', { qid: playerId }, ['group']))[0].group
  }

  async function getEventInfo(playerId: string) {
    let einfo = (await ctx.database.get('erank', { qid: playerId }))[0]
    if (einfo == undefined) return [0, 0]
    return [einfo.totalRuns, einfo.totalScore]
  }

  async function getUserName(session: Session, playerId?: string, isTryAt?: boolean): Promise<string> {
    if (session.onebot) {
      if (isTryAt) return `<at id="${playerId}",name="${playerId}">`
      if (!playerId) return session.author.nick
      return (await session.onebot.getGroupMemberInfo(session.guildId, playerId)).nickname
    }
    console.log(playerId)
    let qqid = await getQQid(session, playerId)
    if (!qqid) return null
    let playerName = (await ctx.database.get('players', { qid: playerId }, ['cachedName']))[0].cachedName
    return ((isTryAt ? '@' : '') + playerName)
  }

  async function formatted_playerdata(session: Session, playerId: string): Promise<string> {
    let isInit = await isInitialized(session, playerId)
    if (!isInit) return '玩家信息未初始化\n请使用CSH 指令自助初始化'
    return `${((!session.onebot) ? '-\n' : '')}玩家: ${await getUserName(session, playerId)}\n集团: ${await getGroup(playerId)}\n车牌: D${await getLicence(playerId)}\n场数: ${await getPlayRoutes(playerId)}\n科技: ${await getTech(playerId)}\nQ Q: ${await getQQid(session, playerId)}`
  }

  async function drs_timer(session: Session, targetType: string): Promise<string> {
    let timerList = await findWaitFromDrs(session, targetType)
    console.log(timerList)
    let tmp = '超时计时: '
    for (const timer of timerList) {
      tmp += timer
    }
    if (timerList.length = 0) return ''
    return tmp
  }

  async function resetATable(tableName: any) {
    try {
      ctx.database.drop(tableName)
    }
    finally { }
  }

  async function getQQid(session: Session, userId?: string, noisy?: boolean): Promise<string> {
    return userId
  }
}

function isValidDrsNum(drs_num: number): boolean {
  return !isNaN(drs_num) && drs_num >= 7 && drs_num <= 12
}
function isAdmin(session: Session): boolean {
  return true
}
function isInitialized(session: Session, playerId?: string): boolean {
  return true
}