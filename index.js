import express from 'express';
import multer from 'multer';
import { TextractClient, AnalyzeDocumentCommand } from "@aws-sdk/client-textract";
import cors from 'cors';


const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(cors());


app.post('/analyze-document', cors(), upload.single('file'), async (req, res) => {
  console.log("inside analyze document server")
  try {
    const file = req.file;

    console.log("file ",file)

    // Analyze the document using Textract
    const textractClient = new TextractClient({
      region:  "ap-south-1",
      credentials: {
        accessKeyId: "AKIAXLI36RQODVQRLAND",
        secretAccessKey: "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"
      }
    });
        const textractResponse = await textractClient.send(new AnalyzeDocumentCommand({
      Document: {
        Bytes: file.buffer
      },
      FeatureTypes: ['FORMS']
    }));

    console.log("response ",textractResponse)
    // Extract key-value pairs
    const keyMap = {};
    const valueMap = {};
    const blockMap = {};
    textractResponse.Blocks.forEach(block => {
      blockMap[block.Id] = block;
      if (block.BlockType === 'KEY_VALUE_SET') {
        if (block.EntityTypes.includes('KEY')) {
          keyMap[block.Id] = block;
        } else {
          valueMap[block.Id] = block;
        }
      }
    });

    const keyValues = {};
    for (const keyId in keyMap) {
      const valueBlock = findValueBlock(keyMap[keyId], valueMap);
      const keyText = getText(keyMap[keyId], blockMap);
      const valueText = getText(valueBlock, blockMap);
      keyValues[keyText] = valueText;
    }

    console.log("key value ",keyValues)
    res.json(keyValues);
  } catch (err) {
    res.status(500).send(err.toString());
  }
});

function findValueBlock(keyBlock, valueMap) {
  let valueBlock;
  keyBlock.Relationships.forEach(relationship => {
    if (relationship.Type === 'VALUE') {
      relationship.Ids.forEach(id => {
        valueBlock = valueMap[id];
      });
    }
  });
  return valueBlock;
}

function getText(result, blockMap) {
  let text = "";
  if (result.Relationships) {
    for (const relationship of result.Relationships) {
      if (relationship.Type === 'CHILD') {
        for (const childId of relationship.Ids) {
          const word = blockMap[childId];
          if (word.BlockType === 'WORD') {
            text += `${word.Text} `;
          }
        }
      }
    }
  }
  return text.trim();
};

app.listen(5005, () => console.log('Server started on port 3000'));
