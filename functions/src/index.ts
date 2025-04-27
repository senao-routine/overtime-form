/**
 * Import function triggers from their respective submodules:
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions";

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// export const helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

// 残業申請を処理するFunction
export const submitOvertime = functions.https.onRequest(async (request, response) => {
  try {
    // CORS設定
    response.set('Access-Control-Allow-Origin', '*');
    
    if (request.method === 'OPTIONS') {
      response.set('Access-Control-Allow-Methods', 'POST');
      response.set('Access-Control-Allow-Headers', 'Content-Type');
      response.status(204).send('');
      return;
    }
    
    if (request.method !== 'POST') {
      response.status(405).send({ error: 'Method not allowed' });
      return;
    }

    const data = request.body;
    logger.info("Received overtime request", { data });
    
    // ここでスプレッドシートへの書き込みなどの処理を実装

    response.status(200).send({ 
      success: true, 
      message: "残業申請が正常に送信されました" 
    });
  } catch (error) {
    logger.error("Error processing overtime request", { error });
    response.status(500).send({ 
      success: false, 
      message: "申請処理中にエラーが発生しました"
    });
  }
});
