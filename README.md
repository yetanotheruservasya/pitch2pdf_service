# pitch2pdf

### Description

Download pitch embedded presentation and save as pdf

### Requirements
 
 - chrome browser

to change browser modify those lines in ```src/index.ts```  

```typescript
const options = new Options().headless();
const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
```

### Install
```bash
npm install && npm run build
```

### Example

```bash
./bin/pitch2pdf https://pitch.com/embed/foo/bar
```

Output will be saved to ```bar.pdf```
