const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

const getFollowingPeopleIdsOfUser = async (username) => {
  const getFollowingPeopleQuery = ` 
    SELECT
    following_user_id
    FROM  follower 
    INNER JOIN user ON user.user_id=follower.follower_user_id
    WHERE
    user.username='${username}';
    `;
  const followingPeople = await db.all(getFollowingPeopleQuery);
  const arrayOfIds = followingPeople.map((eachUser) => {
    eachUser.following_user_id;
  });
  return arrayOfIds;
};

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken) {
    jwt.verify(jwtToken, "S", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        request.userId = payload.userId;
        next();
      }
    });
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};

const tweetAccessVerification = async (request, response, next) => {
  const { userId } = request;
  const { tweetId } = request.params;
  const getTweetQuery = ` 
            SELECT * FROM 
            tweet
             INNER JOIN follower ON tweet.user_id=follower.following_user_id
    
            WHERE 
                 tweet.tweet_id='${tweetId}' AND follower_user_id='${userId}'

             `;
  const tweet = await db.get(getTweetQuery);
  if (tweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const getUserQuery = ` 
          SELECT * FROM user WHERE username='${username}'
    `;
  const userDBDetails = await db.get(getUserQuery);
  if (userDBDetails !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `INSERT INTO user(username , password,name,gender) 
            VALUES('${username}' , '${hashedPassword}' , '${name}' ,'${gender}')
            
            `;
      await db.run(createUserQuery);
      response.send("User created successfully");
    }
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = ` 
    
    SELECT * FROM user WHERE username='${username}' 
    
    `;
  const userDBDetails = await db.get(getUserQuery);

  if (userDBDetails !== undefined) {
    const isPasswordCorrect = await bcrypt.compare(
      password,
      userDBDetails.password
    );
    if (isPasswordCorrect) {
      const payload = { username, userId: userDBDetails.userId };
      const jwtToken = jwt.sign(payload, "S");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request.body;
  const followingPeopleIds = await getFollowingPeopleIdsOfUser(username);
  const getTweetsQuery = `  
    
       SELECT username ,tweet,date_time as dateTime
       FROM user INNER JOIN tweet ON user.user_id=tweet.user_id
       WHERE 
       user.user_id IN (${followingPeopleIds})
       ORDER BY date_time DESC
      
       LIMIT 4;
    
    `;
  const tweets = await db.all(getTweetsQuery);
  response.send(tweets);
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username, userId } = request;

  const getFollowingUserQuery = `
    
          SELECT name FROM follower  
          INNER JOIN user on user.user_id=follower.following_user_id
          WHERE follower_user_id='${userId}'
    
    `;
  const followingPeople = await db.all(getFollowingUserQuery);
  response.send(followingPeople);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username, userId } = request;

  const getFollowersQuery = ` 
    
         SELECT DISTINCT name FROM follower 
         INNER JOIN user on user_id=follower.follower_user_id
         WHERE following_user_id='${userId};'
    
    `;
  const followers = await db.all(getFollowersQuery);
  response.send(followers);
});

app.get(
  "/tweets/:tweetId/",
  authenticateToken,
  tweetAccessVerification,
  async (request, response) => {
    const { username, userId } = request;
    const tweetId = request.params;
    const getTweetQuery = ` 
             SELECT tweet,(SELECT COUNT() FROM like WHERE tweet_id='${tweetId}') AS likes ,
             SELECT tweet,(SELECT COUNT() FROM reply WHERE tweet_id='${tweetId}') AS replies,
             date_time as dateTime

             FROM  tweet 

             WHERE tweet.tweet_id='${tweetId}'  

    `;
    const tweet = await db.get(getTweetQuery);
    response.send(tweet);
    console.log(tweet);
  }
);

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  tweetAccessVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    const getLikesQuery = `

         SELECT username FROM user 
         INNER JOIN like ON user.user_id=like.user_id
         WHERE tweet_id='${tweetId}' `;

    const likedUsers = await db.all(getLikesQuery);
    const usersArray = likedUsers.map((eachUser) => eachUser.username);
    response.send({ likes: usersArray });
    console.log(usersArray);
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  tweetAccessVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    const getLikesQuery = `

         SELECT name FROM reply
         INNER JOIN reply ON user.user_id=reply.user_id
         WHERE tweet_id='${tweetId}' `;

    const replyUsers = await db.all(getLikesQuery);

    response.send({ replies: replyUsers });
  }
);

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { userId } = request;
  const getTweetQuery = ` 
        SELECT tweet, COUNT(DISTINCT like_id) AS likes ,
        COUNT(DISTINCT reply_id)  AS replies, 
        date_time AS dateTime 
        FROM 
           tweet LEFT JOIN reply ON tweet.tweet_id=reply.tweet_id LEFT JOIN like ON 
           tweet.tweet_id=like.tweet_id
        WHERE tweet.user_id='${userId}'
        GROUP BY tweet.tweet_id`;
  const tweets = await db.all(getTweetQuery);
  response.send(tweets);
});

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const userId = parseInt(request.userId);
  const dateTime = new Date().toJSON().substring(0, 19).replace("T", " ");
  const createTweetsQuery = `
            INSERT INTO tweet(tweet ,user_id,date_time)
          VALUES('${tweet}' ,'${userId}' , '${dateTime}')
    `;
  await db.run(createTweetsQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { userId } = request;
    const getTweetQuery = ` 
         SELECT 
           * 
         FROM
          tweet 
         WHERE user_id='${userId}' AND tweet_id='${tweetId}'
    `;

    const tweet = await db.get(getTweetQuery);
    console.log(tweet);
    if (tweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const f = `DELETE FROM tweet WHERE tweet_id='${tweetId}'`;
      await db.run(f);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
