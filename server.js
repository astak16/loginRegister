let http = require('http');
let fs = require('fs')
let url = require('url');
let port = process.argv[2];

if (!port) {
    console.log('请指定端口号好不啦？\nnode server.js 8888 这样不会吗？');
    process.exit(1);
}

let sessions = {};

let server = http.createServer(function (request, response) {
    let parsedUrl = url.parse(request.url, true);
    let path = request.url;
    let query = '';
    if (path.indexOf('?') >= 0) {
        query = path.substring(path.indexOf('?'))
    }
    let pathNoQuery = parsedUrl.pathname;
    let queryObject = parsedUrl.query;
    let method = request.method;

    /******** 从这里开始看，上面不要看 ************/


    if (path === '/') {     //首页路由
        let string = fs.readFileSync('./index.html', 'utf8');
        let cookies = '';
        if (request.headers.cookie) {
            cookies = request.headers.cookie.split(';');     //用';'拆分字符串，如果有多个 Cookie，获取的 Cookie 格式是['email=1@qq.com;a=1@;b=2@']
        }

        let hash = {};  //下面的操作之后，hash会变成{sign_in_email:'1@qq.com'}
        for (let i = 0; i < cookies.length; i++) {
            let parts = cookies[i].split('=');
            let key = parts[0];
            let value = parts[1];
            hash[key] = value;
        }

        //let email = hash.sign_in_email  //根据Cookie找到用户邮箱
        let mySession = sessions[hash.sessionID];
        console.log('hash')
        console.log(hash)
        console.log('mySession')
        console.log(mySession)

        let email;
        if (mySession) {
            email = mySession.sign_in_email;
        }

        //需求，在首页展示用户的密码
        let users = fs.readFileSync('./db', 'utf8');
        users = JSON.parse(users);  //把数据库里读到的字符串变成对象
        //遍历数据库
        let foundUser;  //在数据库里面找登录的用户邮箱
        for (let i = 0; i < users.length; i++) {
            if (users[i].email === email) { //如果数据库里有用户登录的邮箱，就把对应的信息取出来
                foundUser = users[i]; //得到的 foundUser 内容 {email:'1@qq.com',password:'1',password_confirmation:'1'}
                console.log('foundUser');
                console.log(foundUser);
                break;
            }
        }


        if (foundUser) { //sting是数据库里的信息，如果找到就成对应的密码，找不到就说没有
            string = string.replace('__password__', foundUser.password);
        } else {
            string = string.replace('__password__', '不知道');
        }

        response.statusCode = 200;
        response.setHeader('Content-type', 'text/html;charset=utf-8');
        response.write(string);
        response.end();
    } else if (path === '/sign_up' && method === 'GET') {
        let string = fs.readFileSync('./sign_up.html', 'utf8');
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/html;charset=utf-8');
        response.write(string);
        response.end();
    } else if (path === '/sign_up' && method === 'POST') {      //注册路由
        // 获取请求体是后端代码
        let body = [];  //请求体
        request.on('data', (chunk) => {
            body.push(chunk);
        }).on('end', () => {
            body = Buffer.concat(body).toString(); //上传是一段一段的，需要收集起来，最后拼接成请求体，变成字符串。
            //上面代码，用户提交了注册信息，后台获取这部分的信息

            //获取到的请求体是[email=3%40qq.com&password=3$password_confirmation=3]，要拿到{email：1}这样的 key/value 组合，需要用 split 拆分它
            let strings = body.split('&'); //拆分获得的字符串body  strings = ['email=3%40qq.com','password=3','password_confirmation=3']
            let hash = {};
            strings.forEach((string) => { //遍历 strings
                let parts = string.split('=');    //拆分strings  parts = ['email','3%40qq.com'],['password','3'],['password_confirmation','3']
                console.log('parts');
                console.log(parts);
                let key = parts[0];
                let value = parts[1];
                hash[key] = decodeURIComponent(value);   //等价于 hash['email'] = '3%40qq.com'，在http中 @ 是 %40，这里需要翻译一下
            });
            console.log('hash');
            console.log(hash);   //这时候的 hash 就变成了我们想要的结果了 {email:'3@qq.com',password:'3',password_confirmation:'3'}

            //拿到 hash 之后，就可以获取里面的内容
            let {email, password, password_confirmation} = hash;     //等价于下面的三行
            // let email = hash.email
            // let password = hash.password
            // let password_confirmation = hash.password_confirmation

            //验证用户填写的信息格式是否正确
            if (email.indexOf('@') === -1) {
                response.statusCode = 400;
                response.setHeader('Content-Type', 'application/json;charset=utf-8'); //后端告诉前端我返回的是 JSON 语法的字符串
                response.write(`{   
            "errors":{
                    "email":"invalid"
                }
            }`)     //JSON 不包括外面两个引号
            } else if (password !== password_confirmation) {
                response.statusCode = 400;
                response.write('password not match');
            } else {
                //注册成功
                let users = fs.readFileSync('./db', 'utf8');    //读数据库，类型是字符串

                //解析下面这句话，如果出错，就把它清空
                try {
                    users = JSON.parse(users);  //字符串变成对象
                } catch (exception) {       //exception 异常的意思
                    users = [];     //清空
                }

                //用户注册的时候检查数据库里是否存在用户的信息，遍历
                let inUse = false;  //标记，判断的时候需要用到
                for (let i = 0; i < users.length; i++) {
                    let user = users[i];
                    if (user.email === email) {
                        inUse = true;   //存在，标签就变成true
                        break;
                    }
                }
                //判断用户注册的信息是否存在
                if (inUse) {    //如果存在，提示用户已经注册
                    response.statusCode = 400;
                    response.write('email in use');
                } else {        //如果没有，存到数据库里面
                    users.push({email: email, password: password, password_confirmation: password_confirmation})
                    let userString = JSON.stringify(users); //users 是对象，不能直接存在数据库里，需要把它变成字符串
                    fs.writeFileSync('./db', userString);   //存入数据库
                    response.statusCode = 200;
                }
            }
            response.end();
        });
    } else if (path === '/sign_in' && method === 'GET') {
        let string = fs.readFileSync('./sign_in.html', 'utf8');
        response.setHeader('Content-Type', 'text/html;charset=utf-8');
        response.write(string);
        response.end();
    } else if (path === '/sign_in' && method === 'POST') {      //登录路由
        //登录和注册一样，后台都要获取用户提交的信息，逻辑和注册一样
        let body = [];
        request.on('data', (chunk) => {
            body.push(chunk);
        }).on('end', () => {
            body = Buffer.concat(body).toString();
            let strings = body.split('&');
            let hash = {};
            strings.forEach((string) => {
                let parts = string.split('=');
                let key = parts[0];
                let value = parts[1];
                hash[key] = decodeURIComponent(value);
            });

            let {email, password} = hash;
            console.log('hash111111111111111111')
            console.log(hash)
            //上面的代码同注册的一样

            //读取数据库里的信息
            let users = fs.readFileSync('./db', 'utf8');
            try {        //解析下面这句话，如果出错，就把它清空
                users = JSON.parse(users);
            } catch (exception) {
                users = [];
            }

            //验证信息，数据库里是否存在用户提交的信息，遍历数据库
            let found = false;  //标记
            for (let i = 0; i < users.length; i++) {
                if (users[i].email === email && users[i].password === password) {
                    found = true;   //存在，为true
                    break;
                }
            }
            //判断用户注册的信息是否存在
            if (found) {

                let sessionID = Math.random() * 100000;
                sessions[sessionID] = {sign_in_email: email};
                console.log('sessions')
                console.log(sessions)


                var aaaa = `sessionID=${sessionID}`
                console.log(`aaaa`)
                console.log(aaaa)
                response.setHeader('Set-Cookie', aaaa);

                //设置Cookie，用户登录成功发放Cookie，发送请求的时候，都会带上Cookie，Cookie用户可以自己修改
                //response.setHeader('Set-Cookie', `sign_in_email=${email};HttpOnly`);//设置 HttpOnly，用户无法通过 js 修改，但无法手动修改

                response.statusCode = 200;
            } else {
                response.statusCode = 401;
            }
            response.end();
        })
    } else if (path === '/style.css') {
        let string = fs.readFileSync('./style.css', 'utf8');
        response.setHeader('Content-Type', 'text/css;charset=utf-8');
        response.write(string);
        response.end()
    } else if (path === '/main.js') {
        let string = fs.readFileSync('./main.js', 'utf8');
        response.setHeader('Content-Type', 'application/javascript;charset=utf-8');
        response.write(string);
        response.end();
    } else if (path === '/pay') {
        let amount = fs.readFileSync('./db', 'utf8');
        let newAmount = amount - 1;
        fs.writeFileSync('./db', newAmount);
        response.setHeader('content-Type', 'application/javascript;charset=utf-8');
        response.statusCode = 200;
        response.write(`
      ${query.callback}.call(undefined,"success");
    `);
        response.end();
    } else {
        response.statusCode = 404;
        response.end();
    }


    /******** 代码结束，下面不要看 ************/
})

//function readBody(request){
//    return new Promise((resolve) => {
//        let body = [];
//        request.on('data', (chunk) => {
//          body.push(chunk);
//        }).on('end', () => {
//          body = Buffer.concat(body).toString();
//            resolve(body)
//        });
//    })
//}

server.listen(port);
console.log('监听 ' + port + ' 成功\n请用在空中转体720度然后用电饭煲打开 http://localhost:' + port);
