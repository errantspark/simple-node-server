const red = '\x1b[31m'
const blue = '\x1b[36m'
const reset = '\x1b[0m'

const DEV = !!process.argv[1]

import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import url from 'url'
import mime from 'mime'
import http from 'http'
import https from 'https'
import ws from 'ws'

const webRoot = './www'

let applyTemplate = template => object => {
  let keys = Object.keys(object)
  return new Function('input' , `let {${keys.join(',')}} = input
return \`${template}\``)(object)
}

const serveFile = filePath => (req, res) => {
  let url = filePath === undefined?webRoot+req.url:filePath

  fs.readFile(url, (err, data) => {
    if (err) {
      res.writeHead(404)
      res.end(`<h1>404!</h1><br><a href="javascript:history.back()">(Go Back)</a>`)
    } else {
      //let encoding = req.url.match(/.gz$/)?'gzip':'identity'
      res.writeHead(200, {
        'Content-Encoding': 'gzip',
        'Content-Type': mime.getType(req.url)
      })
      zlib.gzip(data, function (_, result) {
        res.end(result)
      })
    }
  })
}

let serveJSON = (object, res) => {
  res.writeHead(200, {
    'Content-Type': 'application/json'
  })
  res.end(JSON.stringify(object))
}

let serveTemplate = (path, inject) => async (req, res) =>{
  let data = inject
  if (typeof inject === 'function') data = await inject(req,res)

  let template = fs.readFileSync(path).toString()

  res.writeHead(200)
  res.end(applyTemplate(template)(data))
}

let buildRouter = (routingTable, def) => {
  let route = query => routingTable.find(entry => query.match('(^|^\/)'+entry.route+'$'))

  return function router(request, response){
    try {
      let query = '/'+request.url.split('/').filter(a=>a).join('/')
      let matchedEntry = route(query)

      if (matchedEntry) {
        matchedEntry.target(request, response)
      } else if (def) {
        def.target(request, response)
      } else {
        throw 'NO ROUTE'
      }
    } catch (e) {
      console.log(e)
      response.writeHead(500)
      response.end(`
      <h3>500: Internal Server Error</h3>
      <div>${e}<div>
      <pre><code>${e.stack}</code></pre>
      `)
    }
  }
}

//routing table
let route = buildRouter([
  {
    route: '/',
    target: serveFile(webRoot+'/index.html'),
  },],
  {
    route: '*',
    target: serveFile(),
  }
)

const routeSocket = message => {
  //websockets API router
  switch (message.type) {
    case 'TEST':
      console.log(message)
      break
  }
}

let serverLogic = (req, res) => {
  switch (req.method) {
    case 'GET' :
      console.log(`[${new Date().toLocaleString()}] ${req.connection.remoteAddress} using ${req.headers["user-agent"]} wants ${req.url}`)
      route(req, res)
      break
  }
}

let connections = []

const wsrouter = ws => {
  connections.push(ws)
  console.log('new connection: #'+connections.length)
  ws.on('error', (msg,i) => {
    console.log('(　･ัω･ั)？')
    console.log(msg)
    console.log(i)
  })
  ws.on('message', msg => {
    console.log(msg)
    if (msg !== '') {
      try {
        msg = JSON.parse(msg)
        routeSocket(msg)
      } catch (e) {
        console.error(e)
      }
    }
  })
  ws.on('close', ev => {
    connections.splice(connections.findIndex(x => x === ws),1)
  })
}

if (!DEV) {
  let settings = {
    //IMPORTANT REPLACE THIS WITH THE PUBLIC IP FOR SSL TO WORK
    //additionally 3001 needs to be forwarded to 433 and 3000 -> 80
    sslHost: 'IP.ADDY.GOES.HERE',
    sslPort: 3001,
    port: 3000,
    sslOpts: {
      key: fs.readFileSync('certs/privkey.pem'),
      cert: fs.readFileSync('certs/fullchain.pem')
    }
  }
  let server = https.createServer(settings.sslOpts, serverLogic).listen(settings.sslPort, settings.sslHost)
  let redirectHttp = http.createServer((req,res) => {
    if (req.method === 'GET') {
      console.log("get",req.url)
      res.writeHead(302, {
        //REDIRECT TO SSL PUT SSL URL HERE
        'Location': 'https://WEBSITE.URL.GOES.HERE'+req.url
      })
      res.end()
    }
  }).listen(settings.port, settings.sslHost)
  //let wss = new ws.Server({server})
  //wss.on('connection', wsrouter)
} else {
  let server = http.createServer(serverLogic).listen(8080, '0.0.0.0')
  //let wss = new ws.Server({server})
  //wss.on('connection', wsrouter)
}

