require("dotenv").config();
const express = require("express");
const app = express();

// FILE
const fs = require("fs");
const { Jimp } = require("jimp");
const sharp = require("sharp");

// QRCODE
const QrCodeReader = require("qrcode-reader");
const jsQR = require("jsqr");
const { decodeQR } = require("@paulmillr/qr/decode.js");

// OCR
const vision = require("@google-cloud/vision");
const tesseract = require("node-tesseract-ocr");

const packageJson = require("./package.json");

const packageName = packageJson.name;
const version = packageJson.version;
const port = 3500;
const isVisionAPI = false;

app.use(express.json({ limit: "10mb" }));

// Start server
app.listen(port, () => {
  console.log(`Server running [${packageName} on port ${port}]`);
  console.log("Version:", version);
});

app.post("/image/read-qrcode", handleImageQRCode);
app.post("/image/read-text", handleImageText);
app.get("/ping", ping);

// Handle image processing
async function handleImageQRCode(req, res) {
  const requestId = Date.now();

  console.time(`handleImageQRCode-${requestId}`);
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).send({ error: "Image data is required." });
    }
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");
    const qrcodeText = await decodeQRCode(imageBuffer);
    console.log("qrcodeText:",qrcodeText)
    console.timeEnd(`handleImageQRCode-${requestId}`);
    res.status(200).send({
      qrcode: qrcodeText,
      ocr: [],
    });
  } catch (error) {
    console.timeEnd(`handleImageQRCode-${requestId}`);
    console.error("[handleImageQRCode] Error:", error);
    res.status(500).send({ error: "Failed to process QR code or OCR." });
  }
}
async function decodeQRCode(imageBuffer) {
  const requestId = Date.now();
  console.time(`decodeQRCode-${requestId}`);
  //ก่อน PROCESS รูป
  // fs.writeFileSync(`fail_slip/image${new Date().getTime()}.jpg`, processedImageBuffer);

  const processedImageBuffer = await sharp(imageBuffer).grayscale().threshold(50).toBuffer();

  //หลัง PROCESS รูป
  // fs.writeFileSync(`fail_slip/image${new Date().getTime()}.jpg`, processedImageBuffer);
  try { 
    var result = await Promise.all([await decodeRawBitmap(imageBuffer, 1), await decodeRawBitmap(processedImageBuffer, 1)]);
    result = result.find((item) => item);
    if (!result) {
      result = await Promise.all([await decodeRawBitmap(imageBuffer, 2), await decodeRawBitmap(processedImageBuffer, 2)]);
      result = result.find((item) => item);
    }
    if (!result) {
      result = await Promise.all([decodeQRCodeRD(imageBuffer, 1.0), decodeQRCodeRD(imageBuffer, 1.5), decodeQRCodeRD(imageBuffer, 2.0), decodeQRCodeRD(processedImageBuffer, 1.0), decodeQRCodeRD(processedImageBuffer, 1.5), decodeQRCodeRD(processedImageBuffer, 2.0)]);
      result = result.find((item) => item);
    }
    if (!result) {
      result = await Promise.all([decodeQRCodeJSQR(imageBuffer), decodeQRCodeJSQR3(imageBuffer), decodeQRCodeJSQR4(imageBuffer), decodeQRCodeJSQR(processedImageBuffer), decodeQRCodeJSQR3(processedImageBuffer), decodeQRCodeJSQR4(processedImageBuffer)]);
      result = result.find((item) => item);
    }
    console.timeEnd(`decodeQRCode-${requestId}`);
    return result || "";
  } catch (error) {
    console.error("Error decoding QR code:", error);
    console.timeEnd(`decodeQRCode-${requestId}`);
    return "";
  }
}

// Decode QR Code
async function decodeRawBitmap(imageBuffer, scale) {
  try {
    const image = await Jimp.read(imageBuffer);
    image.scale(scale).contrast(0.7).greyscale();
    const decoded = decodeQR(image.bitmap);
    return decoded;
  } catch (e) {
    return "";
  }
}
async function decodeQRCodeRD(imageBuffer, scale) {
  try {
    const image = await Jimp.read(imageBuffer);
    image.scale(scale).contrast(0.7).greyscale();
    const qrCodeReader = new QrCodeReader();
    const result = await new Promise((innerResolve, innerReject) => {
      qrCodeReader.callback = (err, res) => (err ? innerReject(err) : innerResolve(res));
      qrCodeReader.decode(image.bitmap);
    });
    if (result.result) {
      console.log("decodeQRCodeRD " + scale);
    }
    return result.result || "";
  } catch (error) {
    return "";
  }
}
async function decodeQRCodeJSQR(imageBuffer) {
  var scaledImageBuffer = imageBuffer;
  var metadata = await sharp(imageBuffer).metadata();
  var width = metadata.width;
  var height = metadata.height;

  if (metadata.height < 1500) {
    scaledImageBuffer = await sharp(imageBuffer)
      .resize({ width: Math.round(metadata.width * 2), height: Math.round(metadata.height * 2) })
      .toBuffer();
    width = width * 2;
    height = height * 2;
  }

  const [topImageBuffer, bottomImageBuffer] = await Promise.all([
    sharp(scaledImageBuffer)
      .extract({ left: 0, top: 0, width: width, height: Math.floor(height / 2) })
      .toBuffer(),
    sharp(scaledImageBuffer)
      .extract({ left: 0, top: Math.floor(height / 2), width: width, height: Math.floor(height / 2) })
      .toBuffer(),
  ]);

  async function scanQR(imageBuffer) {
    const rawImage = await sharp(imageBuffer).raw().ensureAlpha().toBuffer();
    const code = jsQR(new Uint8ClampedArray(rawImage), width, Math.floor(height / 2));
    try {
      return code ? code.data : "";
    } catch (e) {
      return "";
    }
  }

  try {
    // Use Promise.any to return the first successful QR code scan
    const result = await Promise.any([scanQR(topImageBuffer), scanQR(bottomImageBuffer)]);

    if (result) {
      console.log("decodeQRCodeJSQR");
    }

    return result || "";
  } catch (error) {
    // If no QR code is found in either part, return an empty string
    console.log("No QR code found");
    return "";
  }
}
async function decodeQRCodeJSQR3(imageBuffer) {
  // Get metadata and scale the image
  var scaledImageBuffer = imageBuffer;
  var metadata = await sharp(imageBuffer).metadata();
  var width = metadata.width;
  var height = metadata.height;
  if (metadata.height < 1500) {
    scaledImageBuffer = await sharp(imageBuffer)
      .resize({ width: Math.round(metadata.width * 2), height: Math.round(metadata.height * 2) })
      .toBuffer();
    width = width * 2;
    height = height * 2;
  }

  const partHeight = Math.floor(height / 3);

  // Split the image into three parts: top, middle, bottom
  const [topImageBuffer, middleImageBuffer, bottomImageBuffer] = await Promise.all([
    sharp(scaledImageBuffer).extract({ left: 0, top: 0, width: width, height: partHeight }).toBuffer(),
    sharp(scaledImageBuffer).extract({ left: 0, top: partHeight, width: width, height: partHeight }).toBuffer(),
    sharp(scaledImageBuffer)
      .extract({ left: 0, top: 2 * partHeight, width: width, height: height - 2 * partHeight })
      .toBuffer(),
  ]);

  // Function to scan QR codes
  async function scanQR(imageBuffer, regionName) {
    try {
      const rawImage = await sharp(imageBuffer).raw().ensureAlpha().toBuffer();
      const rawMetadata = await sharp(imageBuffer).raw().metadata();

      const code = jsQR(new Uint8ClampedArray(rawImage), rawMetadata.width, rawMetadata.height);

      if (code) {
        return code.data;
      } else {
        return "";
      }
    } catch (error) {
      return "";
    }
  }

  // Use Promise.any to return the first successful QR code scan
  try {
    const result = await Promise.any([scanQR(topImageBuffer, "top"), scanQR(middleImageBuffer, "middle"), scanQR(bottomImageBuffer, "bottom")]);

    if (result) {
      console.log("decodeQRCodeJSQR3");
    }

    // Return the first detected QR code
    return result || "";
  } catch (error) {
    console.log("No QR code found");
    return ""; // Return empty string if no QR code found
  }
}
async function decodeQRCodeJSQR4(imageBuffer) {
  // Get metadata and scale the image
  let scaledImageBuffer = imageBuffer;
  const metadata = await sharp(imageBuffer).metadata();
  let width = metadata.width;
  let height = metadata.height;

  if (metadata.height < 1500) {
    scaledImageBuffer = await sharp(imageBuffer)
      .resize({ width: Math.round(metadata.width * 2), height: Math.round(metadata.height * 2) })
      .toBuffer();
    width = width * 2;
    height = height * 2;
  }

  const partHeight = Math.floor(height / 4);

  // Split the image into four parts: top, middle-top, middle-bottom, bottom
  const [topImageBuffer, middleTopImageBuffer, middleBottomImageBuffer, bottomImageBuffer] = await Promise.all([
    sharp(scaledImageBuffer).extract({ left: 0, top: 0, width: width, height: partHeight }).toBuffer(),
    sharp(scaledImageBuffer).extract({ left: 0, top: partHeight, width: width, height: partHeight }).toBuffer(),
    sharp(scaledImageBuffer)
      .extract({ left: 0, top: 2 * partHeight, width: width, height: partHeight })
      .toBuffer(),
    sharp(scaledImageBuffer)
      .extract({ left: 0, top: 3 * partHeight, width: width, height: height - 3 * partHeight })
      .toBuffer(),
  ]);

  // Function to scan QR codes
  async function scanQR(imageBuffer) {
    try {
      const rawImage = await sharp(imageBuffer).raw().ensureAlpha().toBuffer();
      const rawMetadata = await sharp(imageBuffer).raw().metadata(); // Double-check raw dimensions

      const code = jsQR(new Uint8ClampedArray(rawImage), rawMetadata.width, rawMetadata.height);

      if (code) {
        return code.data;
      }
      return null; // Return null if no QR code found
    } catch (error) {
      return null; // Return null if there is an error
    }
  }

  // Use Promise.any to get the first successful result
  try {
    const result = await Promise.any([scanQR(topImageBuffer), scanQR(middleTopImageBuffer), scanQR(middleBottomImageBuffer), scanQR(bottomImageBuffer)]);

    if (result) {
      console.log("QR Code decoded successfully");
    }

    return result || ""; // Return the first decoded QR code data or an empty string
  } catch (error) {
    console.log("No QR code found");
    return ""; // If no QR code is found, return an empty string
  }
}

// Handle image processing
async function handleImageText(req, res) {
  const requestId = Date.now();

  console.time(`handleImageText-${requestId}`);
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).send({ error: "Image data is required." });
    }
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");
    const ocrText = await extractTextFromImage(imageBuffer);
    console.log(ocrText);
    console.timeEnd(`handleImageText-${requestId}`);
    res.status(200).send({
      qrcode: "",
      ocr: ocrText,
    });
  } catch (error) {
    console.timeEnd(`handleImageText-${requestId}`);
    console.error("[handleImageText] Error:", error);
    res.status(500).send({ error: "Failed to process QR code or OCR." });
  }
}
// Extract text using OCR
async function extractTextFromImage(imageBuffer) {
  const requestId = Date.now(); // Generate a unique ID for this request
  console.time(`extractTextFromImage-${requestId}`);
  try {
    let ocrText = [];
    if (isVisionAPI) {
      const client = new vision.ImageAnnotatorClient({ keyFilename: "./google-credentials.json" });
      const [result] = await client.textDetection(imageBuffer);
      const detections = result.textAnnotations;
      ocrText =
        detections[0]?.description
          ?.split("\n")
          .map((e) => {
            return e.split(/[\[\]\|\)\/\\+\=\%\&\<\>\๐\'\(\*\#\@\!\_\"\?\;\»\“\”\©\«๐-๙]/);
          })
          .flat()
          .map((e) => e.replace(/\s+/g, " ").trim()) || [];
    } else {
      let result = await Promise.all([OCRTesseract(imageBuffer)]);
      ocrText = result.flat();
    }
    console.timeEnd(`extractTextFromImage-${requestId}`);

    return ocrText;
  } catch (error) {
    console.error("[extractTextFromImage] Error in OCR process:", error);
    console.timeEnd(`extractTextFromImage-${requestId}`);
    return [];
  }
}
async function OCRTesseract(imageBuffer) {
  // ขั้นตอน 1: แปลงภาพให้รองรับ OCR
  var metadata = await sharp(imageBuffer).metadata();
  var processedImageBuffer = null;
  if (metadata.height < 1700) {
    processedImageBuffer = await sharp(imageBuffer).grayscale().normalize().resize(2000, null, { fit: "inside" }).toBuffer();
  } else {
    processedImageBuffer = await sharp(imageBuffer).grayscale().normalize().toBuffer();
  }
  // ขั้นตอน 2: เรียก Tesseract OCR แบบหลายภาษา
  const result = await Promise.all([tesseract.recognize(processedImageBuffer, { lang: "eng", oem: 1, psm: 6 }), tesseract.recognize(processedImageBuffer, { lang: "eng", oem: 1, psm: 11 }), tesseract.recognize(processedImageBuffer, { lang: "tha", oem: 1, psm: 1 }), tesseract.recognize(processedImageBuffer, { lang: "tha", oem: 1, psm: 6 }), tesseract.recognize(processedImageBuffer, { lang: "tha", oem: 1, psm: 11 })]);

  // ขั้นตอน 3: รวมข้อความและทำความสะอาดผลลัพธ์
  let ocrText = result
    .join("\n")
    .toUpperCase()
    .replaceAll("%", "X")
    .split("\n")
    .map((e) => {
      return e.split(/[\[\]\|\)\/\\+\=\%\&\<\>\๐\'\(\*\#\@\!\_\"\?\;\»\“\”\©\«๐-๙]/);
    })
    .flat()
    .map((e) => e.replace(/\s+/g, " ").trim())
    .filter((e) => e.replaceAll(" ", "").length > 3);
  ocrText = Array.from(new Set(ocrText));
  return ocrText;
}

// Ping function
async function ping(req, res) {
  try {
    res.status(200).send("version: 1.0.7");
  } catch (error) {
    res.status(500).send("PING ERROR");
  }
}
