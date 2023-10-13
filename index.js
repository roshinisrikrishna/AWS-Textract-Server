import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import multer from 'multer';
import { TextractClient, AnalyzeDocumentCommand } from "@aws-sdk/client-textract";
import cors from 'cors';
import mysql from 'mysql2'; // MySQL database driver

// Create a MySQL database connection pool
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE
});

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(cors());


app.post('/analyze-document', cors(), upload.single('file'), async (req, res) => {
  try {
    const fileName = req.query.file_name;

    // Query to check if the file already exists in the database
    const sqlCheck = `SELECT * FROM ocr_table WHERE file_name = ?`;

    // Execute the query
    db.query(sqlCheck, [fileName], async (err, result) => {
      if (err) throw err;

      // If the file exists in the database
      if (result.length > 0) {
        console.log('File already exists in the database.');

        // Retrieve the existing data
        const existingData = result[0];

        // Send the existing data as a response
        res.json(existingData);
      } else {
        console.log('File does not exist in the database. Proceed with the Textract extraction process.');

        const textractClient = new TextractClient({
            region:  "ap-south-1",
            credentials: {
              // accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              // secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
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
        "Type of Account": 
        // [
          { "skipCount": 1, "textCompare": "Scheme Account" },
        //   { "skipCount": 2, "textCompare": "Scheme Account" },
        //   { "skipCount": 3, "textCompare": "Scheme Account" },
        //   { "skipCount": 4, "textCompare": "Scheme Account" }
        // ],
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
      
      // console.log("ckeck box",checkBoxes);
      
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
      // console.log("Text near checkboxes:", textNearCheckboxes);
      
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
      
      // let keyValuePairs ={ 
      //   'Full Name': 'ROSHINI R NAIR',
      //   Branch: 'COIMBATORE',
      //   'Branch Alpha': 'RSPURM',
      //   'Account No': '1220101001466',
      //   'Date of Birth': '08/03/1998',
      //   PAN: 'CBKAR2036Z',
      //   Gender: 'Female',
      //   'Type of Account': 'Savings Bank A/c',
      //   Occupation: 'BUSINESS',
      //   Status: 'MEDIUM',
      //   'Annual Income': '2400000',
      //   Nationality: 'INDIAN',
      //   "Father's/Husband'sName": 'RAMESH',
      //   'Operating Instructions': 'Self',
      //   'Facilities required': 'Cheque Book'
      // }
      console.log("key avlue pairs ",keyValuePairs)    

        // After the Textract extraction process, add the file to the database
        const keyColumn = Object.keys(keyValuePairs);
        let values = Object.values(keyValuePairs);

        // Convert the Date of Birth from 'DD/MM/YYYY' format to 'YYYY-MM-DD' format
        const dobIndex = keyColumn.indexOf('Date of Birth');
        if (dobIndex >= 0) {
        let dob = values[dobIndex].split("/");
        let formattedDob = `${dob[2]}-${dob[1]}-${dob[0]}`;
        values[dobIndex] = formattedDob;
        }

        values.push(fileName);

        // Construct the INSERT INTO SQL statement
        const sql = `INSERT INTO ocr_table (\`${keyColumn.join('`, `')}\`, file_name) VALUES (${values.map(() => '?').join(', ')})`;

        // Execute the SQL statement
        db.query(sql, values, (err, result) => {
          if (err) throw err;
          console.log('Data inserted successfully');
        });

        // Send the key-value pairs as a response
        res.json(keyValuePairs);
      }
    });
  } catch (err) {
    res.status(500).send(err.toString());
  }
});

const port = process.env.PORT || 5006;

app.listen(port, () => console.log('Server started on port 5006'));
