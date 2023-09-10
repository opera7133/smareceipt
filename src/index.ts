import fastify from "fastify"
import view from "@fastify/view"
import ejs from "ejs"
import fastifyStatic from "@fastify/static"
import fastifyCors from "@fastify/cors"
import path from "path"
import { format, sub } from "date-fns"
import receiptline from "receiptline"
import sharp from "sharp"
import { Printer, Image } from "@node-escpos/core"
import USB from "@node-escpos/usb-adapter"
import Bluetooth from "@node-escpos/bluetooth-adapter"
import fetch from "node-fetch"
import config from "config"

if (
  !config.has("mode") ||
  !config.has("port") ||
  !config.has("shop.name") ||
  !config.has("shop.address") ||
  !config.has("smaregi.id") ||
  !config.has("smaregi.clientId") ||
  !config.has("smaregi.clientSecret")
) {
  throw new Error("config is not set")
}

if (config.get("mode") !== "usb" && config.get("mode") !== "bluetooth") {
  throw new Error("mode is not valid")
}

if (Number(config.get("port")) < 0 || Number(config.get("port")) > 65535) {
  throw new Error("port is not valid")
}

let device: any;
let mode = config.get("mode");
const server = fastify()

function getPaymentMethod(transaction: any) {
  if (transaction.depositCash !== "0" && transaction.depositCash !== 0) {
    return "現金 | ¥" + transaction.depositCash
  } else if (transaction.depositCredit !== "0" && transaction.depositCredit !== 0) {
    return "クレジット | ¥" + transaction.depositCredit
  } else {
    return transaction.depositOthers[0].paymentMethodName + " | ¥" + transaction.depositOthers[0].depositOthers
  }
}

async function printLatestTransaction() {
  let res = [];
  try {
    res.push("Started")
    const json: any = await (await fetch(`https://id.smaregi.jp/app/${config.get("smaregi.id")}/token`, {
      method: "POST",
      headers: {
        "Authorization": "Basic " + Buffer.from(config.get("smaregi.clientId") + ":" + config.get("smaregi.clientSecret")).toString('base64'), "content-type": "application/x-www-form-urlencoded"
      }, body: "grant_type=client_credentials&scope=pos.transactions:read"
    })).json();
    if (json.status || !json.access_token) {
      throw new Error("Request Failed")
    }
    res.push(json.access_token)
    const latestTransactions: any = (await (await fetch(`https://api.smaregi.jp/${config.get("smaregi.id")}/pos/transactions?limit=10&sort=transactionDateTime:desc&with_details=summary&with_deposit_others=all&transaction_date_time-from=${format(sub(new Date(), { days: 30 }), "yyyy-MM-dd'T'HH:mm:ssxxx").replace("+", "%2B").replace(":", "%3A")}&transaction_date_time-to=${format(new Date(), "yyyy-MM-dd'T'HH:mm:ssxxx").replace("+", "%2B").replace(":", "%3A")}`, { method: "GET", headers: { "Authorization": "Bearer " + json.access_token } })).json())
    let latestTransaction: any;
    for (const transaction of latestTransactions) {
      if (Number(transaction.total) > 0) {
        latestTransaction = transaction;
        break;
      }
    }
    /*latestTransaction = {
      transactionDateTime: "2021-08-01T00:00:00+09:00",
      staffId: "0",
      terminalId: "0",
      details: [
        {
          productName: "商品1",
          price: 100,
          quantity: 2
        },
      ],
      amount: 1,
      unitNonDiscountsubtotal: 200,
      total: 200,
      taxInclude: 10,
      change: 0,
      depositCash: 0,
      depositCredit: 200,
      transactionUuid: "1234567812345"
    }*/
    if (!latestTransaction) {
      throw new Error("No transaction found")
    }
    res.push(JSON.stringify(latestTransaction))
    const data = `

    ${config.get("shop.name")}
    ${config.get("shop.address")}
    {width:*,10}
    ${format(new Date(latestTransaction.transactionDateTime), "yyyy/MM/dd HH:mm")} | 担:${latestTransaction.staffId || latestTransaction.terminalId}

    {width: *}
    領 収 書

    ーーーーーーーーーーーーーー

    {width:*,10}
    ${latestTransaction.details.map((product: any) => {
      if (product.quantity > 1) {
        return `${product.productName} |\n{width:10,6,13}\n| ¥${product.price} | ${product.quantity}個 | ¥${product.price * product.quantity}\n{width:*,10}\n`
      } else {
        return `${product.productName} | ¥${product.price}\n`
      }
    }
    ).join()}
    {width:4,*,10}
    小計 | ${latestTransaction.amount}点 | ¥${latestTransaction.unitNonDiscountsubtotal}

    {width:*,10}
    ^合計 | ^¥${latestTransaction.total}
    （内税 | ¥${latestTransaction.taxInclude}）

    ${getPaymentMethod(latestTransaction)}
    お釣り | ^¥${latestTransaction.change}

    {width:*}
    ーーーーーーーーーーーーーー

    {code:${latestTransaction.transactionUuid}; option:code128,2,60,hri}
    `
    const printerInfo: receiptline.Printer = {
      cpl: 32,
      encoding: "cp932",
      upsideDown: false,
      command: "svg"
    }
    const command = receiptline.transform(data, printerInfo);
    if (mode === "usb") {
      device = new USB();
      device.open(async function (err: any) {
        if (err) {
          return
        }
        const options = {}
        let printer = new Printer(device, options);
        sharp(Buffer.from(command))
          .png()
          .toFile("temp.png")
          .then(async () => {
            const img = await Image.load("temp.png");
            const print = await printer.image(img)
                    print.cut().close();
                  })
          })
    } else if (mode === "bluetooth") {
      device.open(async function (err: any) {
        if (err) {
          return
        }
        const options = {}
        let printer = new Printer(device, options);
        sharp(Buffer.from(command))
          .png()
          .toFile("temp.png")
          .then(async () => {
            const img = await Image.load("temp.png");
            const print = await printer.image(img)
              print.cut().close();
        })
      })
    }
    res.push("ok")
    return JSON.stringify({res});
  }
  catch (e) {
    if (e instanceof Error) {
      res.push(e.message)
    } else {
      res.push(e)
    }
    res.push("error")
    return JSON.stringify({res});
  }
}

server.register(view, {
  engine: {
    ejs
  },
})

server.register(fastifyCors, {
  origin: "*",
  credentials: true
})

server.register(fastifyStatic, {
  root: path.resolve(__dirname, '../src/public'),
  prefix: '/public/'
})

server.get('/', (request, reply) => {
  reply.view('/src/views/index.ejs', { name: 'Smareceipt' })
})

server.get('/print', async (request, reply) => {
  reply.send(await printLatestTransaction())
})

server.listen({ port: config.get("port") }, (err, address) => {
  if (err) {
    console.error(err)
  }
  device = new Bluetooth("", null);
  console.log(`Server listening at ${address}`)
})

