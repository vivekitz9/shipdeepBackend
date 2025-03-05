const express = require("express");
const admin = require("firebase-admin");
const serviceAccount = require("../serviceAccountKey.json");
const { insertItem, getAllItems } = require("../service/dynamo");
const router = express.Router();
const { JWT } = require("google-auth-library");
const { v4: uuidv4 } = require('uuid');


//Define the required scopes
const SCOPES = ["https://www.googleapis.com/auth/firebase.messaging"];

const NOTIFICATION_TABLE_NAME = 'notifications'; 

//Create a JWT Client
const client = new JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: SCOPES,
  });


//Obtain an access token
async function getAccessToken() {
    const tokens = await client.authorize();
    // console.log("firebase access token", tokens.access_token);
    return tokens.access_token;
}



router.post("/createNotification",  async (req, res) => {
   const body = req.body;

   try {
    body.id = uuidv4();
    const notificationPayload = {
        id: body.id,
        notificationTitle: body.notificationTitle,
        notificationDescription: body.notificationDescription,
        createdBy: body.userName,
    }
    
     await insertItem(NOTIFICATION_TABLE_NAME, notificationPayload);

    res.success({
        message: "Notification Created Successfully",
        data: notificationPayload
    });
   } catch (err) {
    res.errors({message:'Something went wrong',data:err})
   }
});

router.get("/fetchAllNotifications", async (req,res) => {
  try {
    const notifications = await getAllItems(NOTIFICATION_TABLE_NAME);
    res.success({
      message: "Notifications found successfully",
      data: notifications
    })
  } catch (err) {
    res.errors({message:'Something went wrong',data:err})
  }
});


router.post("/sendNotification", async (req,res) => {
  try {

    const accessToken = await getAccessToken();

    // console.log("access-token", accessToken);

    const item = await getAllItems('users');
    const userDetails = item.Items;

    // console.log("userData", userDetails);

    const fcmId = userDetails.map((d) => d.fcmToken);

    // console.log("fcmId", fcmId);

    // await sendNotification(
    //   "Known Person Detected",
    //   `${resourceExists.resource_name} has been recognized by the system.`,
    //   fcm_id,
    //   accessToken
    // );
  } catch (error) {
    res.errors({message:'Something went wrong',data:err})
  }
});



const sendNotification = async (title, message, deviceTokens, accessToken) => {
  const fcmApiUrl = `https://fcm.googleapis.com/v1/projects/${process.env.PROJECT_ID_WEB}/messages:send`;

  // const token = "en3xuFO9PkZAsyoMvXtLeF:APA91bHJJ5_qM94syyFfn33gh7EjkRWBVdhSq2V5g6r0_WGaov2awGbZPBjQuhMOkvAsXWO5exHIsHRVKNh-Cm8b2x8r8czXWbnrABKqFESfbwXFg8s7N5Qn3RG31werjJH_EjkdJBQK";

  // Iterate over each device token and send a notification
  for (const token of deviceTokens) {
    try {
      const notificationMessage = {
        message: {
          notification: {
            title: title,
            body: message,
          },
          token: token,
        },
      };

      const response = await axios.post(fcmApiUrl, notificationMessage, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });

      console.log(`Notification sent to token: ${token}`, response.data);
    } catch (error) {
      if (error.response) {
        const errorCode = error.response.data.error.code;
        if (
          errorCode === 404 ||
          errorCode === "messaging/registration-token-not-registered"
        ) {
          console.error(
            `Token ${token} is not registered or expired.`,
            error.response.data
          );
        } else {
          console.error(
            `Error sending to token ${token}:`,
            error.response.data
          );
        }
      } else {
        console.error(`Error sending to token ${token}:`, error.message);
      }
    }
  }
};



module.exports = router;





















