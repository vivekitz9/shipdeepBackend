const express = require("express");
const admin = require("firebase-admin");
const axios = require("axios");
const serviceAccount = require("../serviceAccountKey.json");
const { insertItem, getAllItems, uploadFileToS3 } = require("../service/dynamo");
const router = express.Router();
const { JWT } = require("google-auth-library");
const multer = require("multer");
const { v4: uuidv4 } = require('uuid');
const upload = multer({ storage: multer.memoryStorage() });


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



router.post("/createNotification", upload.single("file"),  async (req, res) => {
   const body = req.body;

   try {
    if(!body.notificationTitle){
			res.errors({message:'Notification Title Required'})
		}
    if(!body.notificationDescription){
			res.errors({message:'Notification Description Required'})
		}

    body.id = uuidv4();
    const bucketName = process.env.AWS_S3_BUCKET_NAME;
		const fileContent = req.file.buffer; // File content from Multer
		const newKey = `${Date.now()}_${req.file.originalname}`; // Unique filename
		const contentType = req.file.mimetype;
    //Upload to S3
    const result = await uploadFileToS3(fileContent, bucketName, newKey, contentType);
    // console.log(result);
    const image = result.Location;

    const notificationPayload = {
        id: body.id,
        notificationTitle: body.notificationTitle,
        notificationDescription: body.notificationDescription,
        notificationImage: image,
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


router.post("/sendNotification", upload.single("file"), async (req,res) => {
  try {
    const body = req.body;
    const accessToken = await getAccessToken();

    const bucketName = process.env.AWS_S3_BUCKET_NAME;
		const fileContent = req.file.buffer; // File content from Multer
		const newKey = `${Date.now()}_${req.file.originalname}`; // Unique filename
		const contentType = req.file.mimetype;
    //Upload to S3
    const result = await uploadFileToS3(fileContent, bucketName, newKey, contentType);
    // console.log(result);
    const image = result.Location;


    // console.log("access-token", accessToken);

    const item = await getAllItems('users');
    const userDetails = item.Items;

    // console.log("userData", userDetails);

    const fcmId = userDetails.map((d) => d.fcmToken);

    console.log("fcmTokens", fcmId);

    // const fcmId = ["dqKPbVLkTAitNdfDMuWFHF:APA91bEhnJHX7PNui6I5_rdF5jWBrf3zM7s-JwOXCYFemsb7JsFzeqGfMagXyC-X3lhDF4ZdMDC6QMLARXF5jDPL62BpyhWW5fIkMrzmwKbj8Nc4dsBQs2A"]

    const fcmApiUrl = `https://fcm.googleapis.com/v1/projects/${process.env.PROJECT_ID}/messages:send`;

    for (const token of fcmId) {
      try {
        const notificationMessage = {
          message: {
            notification: {
              title: body.title,
              body: body.description,
              image: image
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
        res.success({
          message: "Notification ssend successfully"
        })
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

  } catch (error) {
    res.errors({message:'Something went wrong',data:err})
  }
});





module.exports = router;





















