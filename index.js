import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import multer from 'multer';
import { TextractClient, AnalyzeDocumentCommand } from "@aws-sdk/client-textract";
import cors from 'cors';


const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(cors());


app.post('/analyze-document', cors(), upload.single('file'), async (req, res) => {
  // console.log("inside analyze document server")
  try {
    const file = req.file;

    console.log("file ",file)

    // Analyze the document using Textract
    const textractClient = new TextractClient({
      region:  "ap-south-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
        const textractResponse = await textractClient.send(new AnalyzeDocumentCommand({
      Document: {
        Bytes: file.buffer
      },
      FeatureTypes: ['FORMS']
    }));

    // console.log(JSON.stringify(textractResponse, null, 2));    // Extract key-value pairs
  //  res.json(textractResponse);


const desiredKeys = {
  "Full Name": { "skipCount": 1, "textCompare": "M/F/TG" },
  "Branch": { "skipCount": 1, "textCompare": "Branch :" },
  "Branch Alpha": { "skipCount": 2, "textCompare": "Code" },
  "Account No": { "skipCount": 1, "textCompare": "Code" },
  "Date of Birth": { "skipCount": 1, "textCompare": "existing)" },
  "PAN": { "skipCount": 2, "textCompare": "existing)" },
  "Gender": { "skipCount": 2, "textCompare": "M/F/TG" },
  "Type of Account": [
    { "skipCount": 1, "textCompare": "Scheme Account" },
    { "skipCount": 2, "textCompare": "Scheme Account" },
    { "skipCount": 3, "textCompare": "Scheme Account" },
    { "skipCount": 4, "textCompare": "Scheme Account" }
  ],
  "Occupation": { "skipCount": 1, "textCompare": "Husband's" },
  "Status": { "skipCount": 2, "textCompare": "Husband's" },
  "Annual Income": { "skipCount": 3, "textCompare": "Husband's" },
  "Nationality": { "skipCount": 5, "textCompare": "Husband's" },
  "Father's/Husband'sName": { "skipCount": 7, "textCompare": "Nationality" },
  "Operating Instructions": { "skipCount": 1, "textCompare": "Operating Instructions" },
  "Facilities required": { "skipCount": 1, "textCompare": "Facilities required" },
};
// Get an array of the keys
const keys = Object.keys(desiredKeys);

console.log("trying to print key value set")
let keyValuePairs = {};

textractResponse.Blocks = textractResponse.Blocks.filter(block => block.Text !== "1" && block.Text !== "2" && block.Text !== "3");

let checkBoxes = {};

for (const block of textractResponse.Blocks) {
  if (block.BlockType === 'SELECTION_ELEMENT') {
    checkBoxes[block.Id] = {
      selectionStatus: block.SelectionStatus,
      geometry: block.Geometry
    };
  }
}

console.log("ckeck box",checkBoxes);

// Create an array to store block.Text values near the checkboxes
const textNearCheckboxes = [];

// Iterate over the checkboxes in the checkBoxes object
for (const checkboxId of Object.keys(checkBoxes)) {
  const checkbox = checkBoxes[checkboxId];

  // Iterate over the blocks in the Textract response
  for (const block of textractResponse.Blocks) {
    if (block.BlockType === 'LINE') {
      // Calculate the absolute difference in top and left geometry values
      const topDiff = Math.abs(checkbox.geometry.BoundingBox.Top - block.Geometry.BoundingBox.Top);
      const leftDiff = Math.abs(checkbox.geometry.BoundingBox.Left - block.Geometry.BoundingBox.Left);

      // Define a threshold value to consider a match
      const threshold = 0.1; // Adjust this threshold as needed

      // Check if the top and left differences are within the threshold
      if (topDiff < 0.025 && leftDiff < 0.04) {
        // If it's a match, add the block.Text to the array
        textNearCheckboxes.push(block.Text);
      }
    }
  }
}

// Now, textNearCheckboxes contains the block.Text values that are near the checkboxes
console.log("Text near checkboxes:", textNearCheckboxes);

// Iterate over the keys in the desiredKeys object
for (const key of Object.keys(desiredKeys)) {
  // Get the desired position for this key
  const desiredPosition = desiredKeys[key];

  // Initialize a variable to hold the matching text
  let matchingText = null;

  // Iterate over the blocks in the Textract response
  let skipBlocks = 0;
  
  // Iterate over the blocks in the Textract response
  for (const block of textractResponse.Blocks) {

   
     // Assume that checkboxId and checkboxTopGeometryValue are the id and top geometry value of the selected checkbox
      
    // Check if the block type is LINE
     if(key === "Account No" || key === "Branch" || key === "Branch Alpha" || key === "PAN" || key === "Date of Birth")
     {
      if (block.BlockType === 'WORD') {
        // If the text is "M/F/TG", skip the next two blocks
        if (block.Text===desiredPosition.textCompare) {
          // console.log("found ",block.Text);
          skipBlocks = desiredPosition.skipCount;
          continue;  // Continue with the next iteration
        }
        // If skipBlocks is more than 0, decrement it and continue with the next iteration
        if (skipBlocks > 0) {
          skipBlocks--;
          // console.log("skip ",skipBlocks," text ",block.Text);
          if (skipBlocks === 0) {
            // console.log("key ",key," value ",block.Text)
            matchingText = block.Text;
            // console.log("full name ",matchingText)
          }
        }
        // If the Full Name hasn't been found yet, store the matching text and set the flag to true
        
      }
     }
    //  else if(key === "Type of Account")
    //  {
    //   // Assume that checkboxId and checkboxTopGeometryValue are the id and top geometry value of the selected checkbox
      

    //   // console.log("Type of Account ");
    //   // const count = 0;
    //     for (const accountPosition of desiredPosition) {
    //       // count++;
    //       // Check if the block text contains the desired text comparison
    //       for (const block of textractResponse.Blocks) {

    //        if (block.BlockType === 'LINE') {
    //         // If the text is "M/F/TG", skip the next two blocks
    //         if (block.Text.includes(accountPosition.textCompare)) {
    //           // if (checkBoxes[block.Id] === 'SELECTED') {
    //             // console.log("found ",block.Text," count ",accountPosition.skipCount);
    //           //   matchingText = block.Text;
    //           // }
    //           skipBlocks = accountPosition.skipCount;
    //           continue;  // Continue with the next iteration
    //         }
    //         // If skipBlocks is more than 0, decrement it and continue with the next iteration
    //         if (skipBlocks > 0) {
    //           skipBlocks--;
    //           // console.log("skip ",skipBlocks," text ",block.Text);
    //           if (skipBlocks === 0) {
    //             // console.log("key ",key," value ",block.Text)
    //             matchingText = block.Text;
    //             // console.log("count ",count," type  ",block.Text)

    //           }
    //         }
    //         // If the Full Name hasn't been found yet, store the matching text and set the flag to true
            
    //       }
    //       if (block.BlockType === 'SELECTION_ELEMENT') {
      
    //         console.log("geometry ",block.Geometry.BoundingBox.Top," id ",block.Id);
          
    //         }
    //     }
    //     }
    //  }
    else {
      if (block.BlockType === 'LINE') {
      // If the text is "M/F/TG", skip the next two blocks
      if (block.Text.includes(desiredPosition.textCompare)) {
        // if (checkBoxes[block.Id] === 'SELECTED') {
        //   console.log("found ",block.Text);
        //   matchingText = block.Text;
        // }
        skipBlocks = desiredPosition.skipCount;
        continue;  // Continue with the next iteration
      }
      // If skipBlocks is more than 0, decrement it and continue with the next iteration
      if (skipBlocks > 0) {
        skipBlocks--;
        // console.log("skip ",skipBlocks," text ",block.Text);
        if (skipBlocks === 0) {
          // console.log("key ",key," value ",block.Text)
          matchingText = block.Text;
          // console.log("full name ",matchingText)
        }
      }
      // If the Full Name hasn't been found yet, store the matching text and set the flag to true
      
    }
  }
    
  }


  
  if (key === "Branch") {
    matchingText = matchingText.replace("Branch :", "").trim();
  }
// Print the key and the matching text
if (key === "Date") {
  matchingText = matchingText.replace("Date:", "").trim();
  matchingText = matchingText.replace("Date :", "").trim();

}
// // If the key is "Date of Birth", format the date
if (key === "Date of Birth") {
  // Insert delimiters into the date string
  const formattedDate = matchingText.replace(/(\d{2})(\d{2})(\d{4})/, "\$1/\$2/\$3");

  // Convert the date string to a Date object
  // const date = new Date(formattedDate);

  // Format the Date object to "dd/mm/yyyy"
  matchingText = formattedDate;
}
if (key === "Gender") {
  if(matchingText === "F")
  {
    matchingText = "Female"
  }
  if(matchingText === "M")
  {
    matchingText = "Male"
  }

}
  // Print the key and the matching text
  console.log(key, matchingText);
  keyValuePairs[key] = matchingText;

}

// Send the key-value pairs as a response
res.json(keyValuePairs);
// res.json(textractResponse);



  } catch (err) {
    res.status(500).send(err.toString());
  }
});



app.listen(5006, () => console.log('Server started on port 5006'));
