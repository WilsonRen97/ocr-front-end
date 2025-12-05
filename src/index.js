import { RTMDet } from "./layout-detector.js";
import { PARSEQ } from "./text-recognizer.js";
import { Person, FamilyTree, toD3TreeWithVirtualRoot } from "./family-tree.js";
import drawFamilyTreeGraph from "./FamilyTreeGraph.js";
import {
  ReadingOrderProcessor,
  loadConfig as loadReadingOrderConfig,
} from "./reading-order.js";
import {
  OutputGenerator,
  loadConfig as loadOutputConfig,
} from "./output-generator.js";

let majorityBelow60 = false;

/**
 * NDLKotenOCR クラス
 * 古典籍OCRの全体処理を管理するクラス
 */
export class NDLKotenOCR {
  /**
   * コンストラクタ
   */
  constructor() {
    this.layoutDetector = null;
    this.textRecognizer = null;
    this.initialized = false;
    this.progress = 0;
    this.progressCallback = null;
  }

  /**
   * 初期化処理
   * モデルのロードと初期設定を行います
   *
   * @param {string} layoutModelPath レイアウト認識モデルのパス
   * @param {Object} layoutConfig レイアウト認識の設定
   * @param {string} layoutConfigPath レイアウト認識の設定ファイルパス（オプション）
   * @param {string} recognizerModelPath 文字認識モデルのパス
   * @param {Object} recognizerConfig 文字認識の設定
   * @param {string} recognizerConfigPath 文字認識の設定ファイルパス（オプション）
   * @param {Function} progressCallback 進捗コールバック関数
   * @returns {Promise<void>}
   */
  async initialize(
    layoutModelPath,
    layoutConfig = {},
    layoutConfigPath = null,
    recognizerModelPath,
    recognizerConfig = {},
    recognizerConfigPath = null,
    progressCallback = null
  ) {
    this.progressCallback = progressCallback;
    this.updateProgress(
      0,
      "Initializing... (First time may take a while to download the model)"
    );
    this.configPath = layoutConfigPath || recognizerConfigPath || null;

    try {
      // レイアウト検出器の初期化
      this.layoutDetector = new RTMDet(
        layoutModelPath,
        layoutConfig,
        layoutConfigPath
      );
      await this.layoutDetector.initialize(layoutConfigPath);
      this.updateProgress(5, "Layout recognition model loaded.");
      this.updateProgress(10, "Starting to load the text recognition model...");

      // テキスト認識器の初期化
      this.textRecognizer = new PARSEQ(
        recognizerModelPath,
        recognizerConfig,
        recognizerConfigPath,
        "config/NDLmoji.yaml" // 文字リストファイルパス
      );
      await this.textRecognizer.initialize(
        recognizerConfigPath,
        "config/NDLmoji.yaml"
      );
      this.updateProgress(11, "Text recognition model loaded.");

      // 読み順処理の設定を読み込む
      const readingOrderConfig = await loadReadingOrderConfig(this.configPath);
      this.readingOrderProcessor = new ReadingOrderProcessor(
        readingOrderConfig
      );
      this.updateProgress(15, "Reading order processing settings loaded.");

      // 出力生成の設定を読み込む
      const outputConfig = await loadOutputConfig(this.configPath);
      this.outputGenerator = new OutputGenerator(outputConfig);
      this.updateProgress(18, "Output generation settings loaded.");

      this.initialized = true;
    } catch (error) {
      console.error("Initialization error", error);
      throw new Error(`NDLKotenOCR Initialization error: ${error.message}`);
    }
  }

  /**
   * 進捗状況の更新
   *
   * @param {number} progress 進捗率 (0-100)
   * @param {string} message 進捗メッセージ
   * @private
   */
  updateProgress(progress, message) {
    this.progress = progress;
    if (this.progressCallback) {
      this.progressCallback(progress, message);
    }
  }

  /**
   * 画像処理の実行
   *
   * @param {ImageData|HTMLImageElement|HTMLCanvasElement} imageData 処理する画像
   * @param {Object} options オプション設定
   * @returns {Promise<Object>} 処理結果
   */
  async process(imageData, options = {}) {
    if (!this.initialized) {
      throw new Error(
        "NDLKotenOCR が初期化されていません。initialize() を先に呼び出してください。"
      );
    }

    this.updateProgress(20, "Starting process");
    // UIの更新を許可するためのマイクロタスク
    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
      // 1. レイアウト検出
      this.updateProgress(25, "Detecting layout...");
      // UIの更新を許可するためのマイクロタスク
      await new Promise((resolve) => setTimeout(resolve, 0));

      const detections = await this.layoutDetector.detect(imageData);
      this.updateProgress(30, `${detections.length} detected text regions`);
      // UIの更新を許可するためのマイクロタスク
      await new Promise((resolve) => setTimeout(resolve, 0));

      // 2. テキスト認識
      this.updateProgress(31, "Starting text recognition...");
      // UIの更新を許可するためのマイクロタスク
      await new Promise((resolve) => setTimeout(resolve, 0));

      const recognizedDetections = [];
      let count = 0;
      for (const detection of detections) {
        // 検出された領域を切り出し
        const lineImage = this.cropImage(imageData, detection.box);
        // テキスト認識
        const text = await this.textRecognizer.read(lineImage);
        recognizedDetections.push({
          ...detection,
          text,
        });

        count++;
        this.updateProgress(
          31 + Math.floor((count / detections.length) * 30),
          `Recognizing text... (${count}/${detections.length})`
        );

        // UIの更新を許可するためのマイクロタスク
        // 各テキスト領域の処理後に追加
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      // 3. 読み順処理
      this.updateProgress(50, "Processing reading order...");
      // UIの更新を許可するためのマイクロタスク
      await new Promise((resolve) => setTimeout(resolve, 0));

      const orderedDetections = this.readingOrderProcessor.process(
        recognizedDetections,
        imageData.width,
        imageData.height
      );

      // 4. 出力生成
      this.updateProgress(60, "Generating outputs...");
      // UIの更新を許可するためのマイクロタスク
      await new Promise((resolve) => setTimeout(resolve, 0));

      const results = {
        detections: orderedDetections,
        xml: this.outputGenerator.generateXML(
          orderedDetections,
          imageData.width,
          imageData.height,
          options.imageName || "image"
        ),
        json: this.outputGenerator.generateJSON(
          orderedDetections,
          imageData.width,
          imageData.height,
          options.imageName || "image"
        ),
        text: this.outputGenerator.generateTXT(orderedDetections),
      };

      let data = results.json;
      let documentHeight = data.document.image.height;
      let textObjects = data.document.image.text;
      let below60Counter = 0;
      for (let i = 0; i < textObjects.length; i++) {
        let height = textObjects[i].height;
        if (height < documentHeight * 0.6) {
          below60Counter++;
        }
      }
      majorityBelow60 = below60Counter > textObjects.length / 2;
      console.log("Majority below 60% height:", majorityBelow60);

      if (majorityBelow60) {
        // 這是資料型圖片，所以需要特別處理
        // 另外，不需要在前端顯示OCR結果，因為用不到
        results.text = "";

        // store the same cluster data together
        // let clusteredTexts = {};
        // for (let item of response.data) {
        //   if (!clusteredTexts[item.cluster]) {
        //     clusteredTexts[item.cluster] = [];
        //   }
        //   clusteredTexts[item.cluster].push(item);
        // }
        // results.clusteredTexts = clusteredTexts;

        // 將圖片送往後端進行 grayscale, canny
        // console.log(options);
        if (options.imageDataURL) {
          console.log("Sending image to backend for processing...");
          let imageResponse = await this.sendImageToBackend(
            options.imageDataURL
          );
          console.log("Backend image processing result:", imageResponse);

          if (imageResponse.status === "ok") {
            // imageResponse has horizontal_lines, which is an array of arrays, each array has 4 int x1 y1 x2 y2, representing a line in the image
            // imageResponse also has vertical_lines, with the same format

            // imageResponse also has boxes, which is an array of arrays, each array has 4 int x1 y1 width height, representing a box in the image
            let boxes = imageResponse.boxes;
            let familyTree = new FamilyTree();
            for (let i = 0; i < boxes.length; i++) {
              let box = boxes[i];
              familyTree.addPerson(`Person${i}`, box);
            }

            // vertical_data is an object with key is vertical line index
            // and value is an array of arrays, each array has 4 int x1 y1 width height, representing a box in the image
            // 透過 vertical_data 建立父子關係
            let vertical_data = imageResponse.vertical_data;
            for (let key in vertical_data) {
              let v_boxes = vertical_data[key];
              if (v_boxes.length > 1) {
                for (let i = v_boxes.length - 1; i > 0; i--) {
                  let childBox = v_boxes[i];
                  let parentBox = v_boxes[i - 1];
                  const childIndex = boxes.findIndex(
                    (b) =>
                      b.length === childBox.length &&
                      b.every((v, i) => v === childBox[i])
                  );
                  let childPerson = familyTree.getPerson(`Person${childIndex}`);
                  const parentIndex = boxes.findIndex(
                    (b) =>
                      b.length === parentBox.length &&
                      b.every((v, i) => v === parentBox[i])
                  );
                  let parentPerson = familyTree.getPerson(
                    `Person${parentIndex}`
                  );
                  if (childPerson && parentPerson) {
                    console.log(
                      "setting parent once",
                      parentPerson.name,
                      "->",
                      childPerson.name
                    );
                    childPerson.setParent(parentPerson);
                  }
                }
              }
            }
            // horizontal_box_connections is also an object with key is horizontal line index
            // and the value is an array of arrays, each array has 4 int x1 y1 width height, representing a box in the image
            // 透過 horizontal_box_connections 建立兄弟關係
            let horizontal_box_connections =
              imageResponse.horizontal_box_connections;
            for (let key in horizontal_box_connections) {
              let h_boxes = horizontal_box_connections[key];
              if (h_boxes.length > 1) {
                for (let i = 0; i < h_boxes.length - 1; i++) {
                  let boxA = h_boxes[i];
                  let boxB = h_boxes[i + 1];
                  const indexA = boxes.findIndex(
                    (b) =>
                      b.length === boxA.length &&
                      b.every((v, i) => v === boxA[i])
                  );
                  const indexB = boxes.findIndex(
                    (b) =>
                      b.length === boxB.length &&
                      b.every((v, i) => v === boxB[i])
                  );
                  let personA = familyTree.getPerson(`Person${indexA}`);
                  let personB = familyTree.getPerson(`Person${indexB}`);
                  if (personA && personB) {
                    console.log(
                      "adding sibling once",
                      personA.name,
                      "<->",
                      personB.name
                    );
                    personA.addSibling(personB);
                  }
                }
              }
            }

            // 打印家族樹
            familyTree.printTree();

            for (const person of familyTree.getAllPeople()) {
              const box = person.boundingBox; // [x1, y1, width, height]
              // 轉成 [x1, y1, x2, y2] 格式
              const [x1, y1, width, height] = box;
              const x2 = x1 + width;
              const y2 = y1 + height;
              const croppedImage = this.cropImage(imageData, [x1, y1, x2, y2]);
              const name = await this.textRecognizer.read(croppedImage);
              person.name = name; // 更新 person 的名字
            }

            const d3TreeData = toD3TreeWithVirtualRoot(familyTree);
            drawFamilyTreeGraph(document.getElementById("tree"), d3TreeData);
          }
        }
      }

      // 移除片假名、英数字等非漢字字符
      this.updateProgress(70, "Translating text...");
      let cleanText = this.removeNonKanjiCharacters(results.text);

      // 如果是故事型圖片，則進行翻譯
      // 如果是資料型圖片，則跳過翻譯步驟
      if (majorityBelow60) {
        this.updateProgress(75, "Skipping translation for data-type image.");
        results.punctuatedText = "";
        results.translatedText = "";
        results.retrievedInfoArray = [""];
        results.retrievedInfo = "";
      } else {
        this.updateProgress(
          75,
          "Proceeding with translation for story-type image."
        );
        let jiayan_text = await this.jiayanPunctuation(cleanText);
        console.log("Jiayan punctuated text:", jiayan_text);
        results.punctuatedText = jiayan_text;

        try {
          let { chunks, translations, retrievedInfo } =
            await this.translateTextThroughLLM(jiayan_text);
          let translatedText = translations;
          let info = retrievedInfo;
          this.updateProgress(90, "Translation completed.");
          results.translatedText = translatedText.join("\n");
          // flatten info array
          info = info.flat(Infinity);
          // remove duplicates
          info = [...new Set(info)];
          results.retrievedInfoArray = info;
          results.retrievedInfo = info.join("\n");
          console.log("Retrieved info:", info);
          console.log("Translated retrievedInfo:", retrievedInfo);
        } catch (error) {
          console.error("Translation error:", error);
          this.updateProgress(80, "Translation failed.");
        }
      }

      this.updateProgress(100, "Process completed.");
      await new Promise((resolve) => setTimeout(resolve, 0));
      return results;
    } catch (error) {
      console.error("處理失敗:", error);
      throw new Error(`Process failed: ${error.message}`);
    }
  }

  async jsonToBackend(jsonData) {
    const response = await fetch("http://127.0.0.1:8000/jsonData", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(jsonData),
    });
    return response.json();
  }

  async sendImageToBackend(dataUrl) {
    const response = await fetch("http://127.0.0.1:8000/uploadImage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ image: dataUrl }),
    });
    return response.json();
  }

  async rag(classicalTextList, modernTextList) {
    let responses = [];
    for (let i = 0; i < classicalTextList.length; i++) {
      const classicalText = classicalTextList[i];
      const modernText = modernTextList[i];
      const response = await fetch("http://127.0.0.1:8000/rag", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          classical_text: classicalText,
          modern_text: modernText,
        }),
      });
      const data = await response.json();
      console.log("RAG result:", data);
      responses.push(data.response);
    }

    console.log("All RAG responses:", responses);
    return responses.join("\n");
  }

  async jiayanPunctuation(text) {
    // concat all text into one line
    const singleLineText = text.replace(/\n/g, "");
    const response = await fetch("http://127.0.0.1:8000/punctuate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: singleLineText }),
    });
    const data = await response.json();
    console.log("Jiayan punctuation result:", data);
    return data.punctuated;
  }

  async translateTextThroughLLM(text) {
    // Split text into chunks
    const chunks = this.splitChineseText(text, 60);
    // collect translation results
    let translations = [];
    let retrievedInfo = [];
    for (let i = 0; i < chunks.length; i++) {
      let chunk = chunks[i];
      // make HTTP POST request to local server 8000
      const response = await fetch("http://127.0.0.1:8000/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: chunk }),
      });
      const data = await response.json();
      console.log("Original text:", chunk);
      console.log("Translation result:", data);
      translations.push(data.translation);
      retrievedInfo.push(data.retrieved_info);
    }
    return { chunks, translations, retrievedInfo };
  }

  splitChineseText(text, maxLen = 60) {
    const punctuation = "，。；：？！…、";
    const chunks = [];
    let start = 0;

    while (start < text.length) {
      let end = Math.min(start + maxLen, text.length);
      let candidate = text.slice(start, end);

      if (punctuation.includes(candidate[candidate.length - 1])) {
        // Ends with punctuation → good split
        chunks.push(candidate);
        start = end;
      } else {
        // Look backwards for nearest punctuation
        let splitPos = -1;
        for (let i = candidate.length - 1; i >= 0; i--) {
          if (punctuation.includes(candidate[i])) {
            splitPos = i;
            break;
          }
        }

        if (splitPos !== -1) {
          chunks.push(text.slice(start, start + splitPos + 1));
          start = start + splitPos + 1;
        } else {
          // No punctuation found → split at maxLen
          chunks.push(candidate);
          start = end;
        }
      }
    }

    return chunks;
  }

  // 移除片假名、英数字等非漢字字符的函數
  removeNonKanjiCharacters(text) {
    console.log("Original text:", text);

    const ranges = [
      [0x4e00, 0x9fff], // CJK Unified Ideographs
      [0x3400, 0x4dbf], // Extension A
      [0x20000, 0x2a6df], // Extension B
      [0x2a700, 0x2b73f], // Extension C
      [0x2b740, 0x2b81f], // Extension D
      [0x2b820, 0x2ceaf], // Extension E
      [0xf900, 0xfaff], // Compatibility Ideographs
      [0x2f800, 0x2fa1f], // Compatibility Ideographs Supplement
    ];

    const isHan = (cp) => ranges.some(([a, b]) => cp >= a && cp <= b);

    // Include CJK punctuation, middle dot, 〇, etc.
    const sentencePunct = new Set([
      "。",
      "！",
      "?",
      "？",
      "!",
      "、",
      "，",
      ",",
      "；",
      ";",
      "：",
      ":",
      "．",
      "·",
      "・",
      "〇",
      "〃",
    ]);

    text = text.replace(/\\n/g, "\n");
    const lines = text.split(/\r\n|\r|\n/);
    const outLines = [];

    for (const line of lines) {
      // console.log("Processing line:", line);
      let current = "";

      for (const ch of line) {
        const cp = ch.codePointAt(0);
        if (isHan(cp) || sentencePunct.has(ch)) {
          current += ch;
        }
      }

      const trimmed = current.trim();
      // ✅ Keep line only if there’s content after removal
      if (trimmed.length > 0) {
        outLines.push(trimmed);
      }
    }

    // ✅ Join with newline — keeps one line per original non-empty sentence
    return outLines.join("\n");
  }

  /**
   * 画像から指定された領域を切り出す
   *
   * @param {ImageData|HTMLImageElement|HTMLCanvasElement} imageData 元画像
   * @param {Array<number>} box 切り出し領域 [x1, y1, x2, y2]
   * @returns {ImageData} 切り出された画像
   * @private
   */
  cropImage(imageData, box) {
    const [x1, y1, x2, y2] = box;
    const width = Math.max(1, Math.round(x2 - x1)); // 最小幅を1pxに設定
    const height = Math.max(1, Math.round(y2 - y1)); // 最小高さを1pxに設定

    // 画像のサイズを取得
    let imgWidth, imgHeight;
    if (imageData instanceof ImageData) {
      imgWidth = imageData.width;
      imgHeight = imageData.height;
    } else {
      imgWidth = imageData.naturalWidth || imageData.width;
      imgHeight = imageData.naturalHeight || imageData.height;
    }

    // 座標が画像の範囲内に収まるように調整
    const safeX1 = Math.max(0, Math.min(imgWidth - 1, Math.round(x1)));
    const safeY1 = Math.max(0, Math.min(imgHeight - 1, Math.round(y1)));
    const safeWidth = Math.min(width, imgWidth - safeX1);
    const safeHeight = Math.min(height, imgHeight - safeY1);

    // Canvas要素を作成
    const canvas = document.createElement("canvas");
    canvas.width = safeWidth;
    canvas.height = safeHeight;
    const ctx = canvas.getContext("2d");

    // 画像の種類に応じて適切に描画
    if (imageData instanceof ImageData) {
      // ImageDataの場合
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = imageData.width;
      tempCanvas.height = imageData.height;
      const tempCtx = tempCanvas.getContext("2d");
      tempCtx.putImageData(imageData, 0, 0);
      ctx.drawImage(
        tempCanvas,
        safeX1,
        safeY1,
        safeWidth,
        safeHeight,
        0,
        0,
        safeWidth,
        safeHeight
      );
    } else {
      // HTMLImageElement または HTMLCanvasElement の場合
      ctx.drawImage(
        imageData,
        safeX1,
        safeY1,
        safeWidth,
        safeHeight,
        0,
        0,
        safeWidth,
        safeHeight
      );
    }

    return ctx.getImageData(0, 0, safeWidth, safeHeight);
  }
}

// ブラウザ環境での初期化処理
document.addEventListener("DOMContentLoaded", () => {
  // タブ切り替え機能
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", function () {
      // アクティブなタブを切り替え
      document.querySelector(".tab.active").classList.remove("active");
      this.classList.add("active");

      // タブコンテンツを切り替え
      const tabName = this.getAttribute("data-tab");
      document.querySelector(".tab-content.active").classList.remove("active");
      document.getElementById(`${tabName}-content`).classList.add("active");
    });
  });

  const imageUpload = document.getElementById("image-upload");
  const sampleButton = document.getElementById("sample-button");
  const previewContainer = document.getElementById("image-preview-container");
  const processButton = document.getElementById("process-button");
  const progressBar = document.getElementById("progress-bar");
  const resultCanvas = document.getElementById("result-canvas");
  const textResult = document.getElementById("text-result");
  const xmlResult = document.getElementById("xml-result");
  const jsonResult = document.getElementById("json-result");
  const imageSelector = document.getElementById("image-selector");
  const prevImageButton = document.getElementById("prev-image-button");
  const nextImageButton = document.getElementById("next-image-button");

  // 選択された画像を保持する配列
  let selectedImages = [];
  // 処理結果を保持する配列
  let processedResults = [];
  // 現在処理中の画像インデックス
  let currentImageIndex = 0;
  // 現在表示中の結果インデックス
  let currentResultIndex = 0;
  // 全体の進捗状況
  let overallProgress = 0;

  // NDLKotenOCRインスタンスの作成
  const ocr = new NDLKotenOCR();

  // サムネイル生成関数
  function createThumbnail(file, index) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = function (event) {
        const thumbnailWrapper = document.createElement("div");
        thumbnailWrapper.className = "thumbnail-wrapper";

        const thumbnail = document.createElement("img");
        thumbnail.className = "thumbnail";
        thumbnail.src = event.target.result;
        thumbnail.alt = `Image ${index + 1}`;

        const label = document.createElement("div");
        label.className = "thumbnail-label";
        label.textContent =
          file.name.length > 15
            ? file.name.substring(0, 12) + "..."
            : file.name;

        thumbnailWrapper.appendChild(thumbnail);
        thumbnailWrapper.appendChild(label);

        resolve({
          element: thumbnailWrapper,
          dataUrl: event.target.result,
          file: file,
        });
      };
      reader.readAsDataURL(file);
    });
  }

  // 画像選択時の処理
  imageUpload.addEventListener("change", async function (e) {
    // 既存のサムネイルをクリア
    previewContainer.innerHTML = "";
    selectedImages = [];

    if (e.target.files.length > 0) {
      const files = Array.from(e.target.files).filter((file) =>
        file.type.match("image.*")
      );

      if (files.length === 0) return;

      // サムネイル生成と表示
      const thumbnailPromises = files.map((file, index) =>
        createThumbnail(file, index)
      );

      const thumbnails = await Promise.all(thumbnailPromises);
      selectedImages = thumbnails;

      // サムネイルをコンテナに追加
      thumbnails.forEach((thumbnail) => {
        previewContainer.appendChild(thumbnail.element);
      });

      // 処理ボタンを有効化
      processButton.disabled = false;
    } else {
      processButton.disabled = true;
    }
  });

  // ドラッグ&ドロップ処理
  const uploadSection = document.querySelector(".upload-section");

  uploadSection.addEventListener("dragover", function (e) {
    e.preventDefault();
    this.style.borderColor = "#4CAF50";
  });

  uploadSection.addEventListener("dragleave", function () {
    this.style.borderColor = "#ccc";
  });

  uploadSection.addEventListener("drop", async function (e) {
    e.preventDefault();
    this.style.borderColor = "#ccc";

    const files = Array.from(e.dataTransfer.files).filter((file) =>
      file.type.match("image.*")
    );

    if (files.length === 0) return;

    // ファイル入力要素にファイルを設定
    const dataTransfer = new DataTransfer();
    files.forEach((file) => dataTransfer.items.add(file));
    imageUpload.files = dataTransfer.files;

    // 既存のサムネイルをクリア
    previewContainer.innerHTML = "";
    selectedImages = [];

    // サムネイル生成と表示
    const thumbnailPromises = files.map((file, index) =>
      createThumbnail(file, index)
    );

    const thumbnails = await Promise.all(thumbnailPromises);
    selectedImages = thumbnails;

    // サムネイルをコンテナに追加
    thumbnails.forEach((thumbnail) => {
      previewContainer.appendChild(thumbnail.element);
    });

    // 処理ボタンを有効化
    processButton.disabled = false;
  });

  // サンプル画像ボタンのイベントリスナー
  sampleButton.addEventListener("click", async () => {
    // 既存のサムネイルをクリア
    previewContainer.innerHTML = "";
    selectedImages = [];

    try {
      // サンプル画像のURLを設定
      const sampleImageUrl = "public/sample.png";

      // 画像をフェッチして File オブジェクトに変換
      const response = await fetch(sampleImageUrl);
      const blob = await response.blob();
      const file = new File([blob], "sample.png", {
        type: blob.type,
      });

      // サムネイル生成
      const thumbnail = await createThumbnail(file, 0);
      selectedImages = [thumbnail];

      // サムネイルをコンテナに追加
      previewContainer.appendChild(thumbnail.element);

      // 処理ボタンを有効化
      processButton.disabled = false;
    } catch (error) {
      console.error("サンプル画像の読み込みエラー:", error);
      alert("サンプル画像の読み込みに失敗しました。");
    }
  });

  // 進捗コールバック
  const updateProgress = (progress, message) => {
    // 現在の画像の進捗を全体の進捗に反映
    const singleImageWeight = 100 / selectedImages.length;
    overallProgress =
      currentImageIndex * singleImageWeight +
      (progress * singleImageWeight) / 100;

    progressBar.value = Math.round(overallProgress);

    // 進捗メッセージに画像番号を追加
    const overallMessage = `Image ${currentImageIndex + 1}/${
      selectedImages.length
    }: ${message}`;

    // 画面上の進捗メッセージを更新
    const loadingMessage = document.getElementById("loading-message");
    if (loadingMessage) {
      loadingMessage.textContent = overallMessage;
    } else {
      console.error("loading-message 要素が見つかりませんでした");
    }

    console.log(`進捗: ${Math.round(overallProgress)}% - ${overallMessage}`);
  };

  // 画像セレクタの変更イベント
  imageSelector.addEventListener("change", function () {
    const selectedIndex = this.selectedIndex;
    if (selectedIndex >= 0 && selectedIndex < processedResults.length) {
      displayResult(selectedIndex);
    }
  });

  // 前の画像ボタンのイベントリスナー
  prevImageButton.addEventListener("click", function () {
    if (currentResultIndex > 0) {
      displayResult(currentResultIndex - 1);
    }
  });

  // 次の画像ボタンのイベントリスナー
  nextImageButton.addEventListener("click", function () {
    if (currentResultIndex < processedResults.length - 1) {
      displayResult(currentResultIndex + 1);
    }
  });

  // ナビゲーションボタンの状態を更新
  function updateNavigationButtons() {
    prevImageButton.disabled = currentResultIndex <= 0;
    nextImageButton.disabled =
      currentResultIndex >= processedResults.length - 1;
  }

  // 結果表示関数
  function displayResult(index) {
    currentResultIndex = index;
    const result = processedResults[index];

    // セレクタの選択を更新
    imageSelector.selectedIndex = index;

    // 結果の表示
    textResult.textContent = result.text.replace(/\\n/g, "\n");
    const origText = (result.text || "").replace(/\\n/g, "\n");
    textResult.textContent = origText;

    let punctuatedEl = document.getElementById("punctuated-text-result");
    if (!punctuatedEl) {
      punctuatedEl = document.createElement("pre");
      punctuatedEl.id = "punctuated-text-result";
      punctuatedEl.className = "punctuated-text";
      // 在原文下方插入
      textResult.parentNode.insertBefore(punctuatedEl, textResult.nextSibling);
    }
    punctuatedEl.textContent = (result.punctuatedText || "").replace(
      /\\n/g,
      "\n"
    );

    let counter = 1;
    for (let i = 0; i < result.retrievedInfoArray.length; i++) {
      let info = result.retrievedInfoArray[i][0];
      console.log("Retrieved info:", info);
      if (!info) continue;
      // info is '息: 周代姬姓國，在今河南息縣西南。約在公元前683年左右為楚所滅。'
      let key = info.split(":")[0];
      // find the key in punctuatedText
      let index = punctuatedEl.textContent.indexOf(key);
      console.log("Key:", key, "Index:", index);
      if (index !== -1) {
        // insert a number superscript after the key
        let superscript = `［${counter}］`;
        punctuatedEl.textContent =
          punctuatedEl.textContent.slice(0, index + key.length) +
          superscript +
          punctuatedEl.textContent.slice(index + key.length);
        counter++;
      }
    }

    let translatedEl = document.getElementById("translated-text-result");
    let infoEl = document.getElementById("retrieved-info-result");
    // let clusteredTextsEl = document.getElementById("clustered-texts-result");
    if (!translatedEl) {
      translatedEl = document.createElement("pre");
      translatedEl.id = "translated-text-result";
      translatedEl.className = "translated-text";
      // 在原文下方插入
      textResult.parentNode.insertBefore(translatedEl, textResult.nextSibling);
    }
    translatedEl.textContent = (result.translatedText || "").replace(
      /\\n/g,
      "\n"
    );

    if (!infoEl) {
      infoEl = document.createElement("pre");
      infoEl.id = "retrieved-info-result";
      infoEl.className = "retrieved-info-text";
      // 在翻譯結果下方插入
      translatedEl.parentNode.insertBefore(infoEl, translatedEl.nextSibling);
    }
    const infoLines = (result.retrievedInfo || "")
      .replace(/\\n/g, "\n")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line, idx) => `［${idx + 1}］${line}`);
    infoEl.innerHTML = infoLines.join("<br>");

    // if (!clusteredTextsEl) {
    //   clusteredTextsEl = document.createElement("pre");
    //   clusteredTextsEl.id = "clustered-texts-result";
    //   clusteredTextsEl.className = "clustered-texts-text";
    //   // 在檢索信息下方插入
    //   infoEl.parentNode.insertBefore(clusteredTextsEl, infoEl.nextSibling);
    // }
    // if (result.clusteredTexts) {
    //   let clusteredTextLines = [];
    //   for (let cluster in result.clusteredTexts) {
    //     clusteredTextLines.push(`Cluster: ${cluster}`);
    //     for (let item of result.clusteredTexts[cluster]) {
    //       clusteredTextLines.push(` - ${item.text}`);
    //     }
    //   }
    //   clusteredTextsEl.innerHTML = clusteredTextLines.join("<br>");
    // }

    // let ragEl = document.getElementById("rag-result");
    // if (!ragEl) {
    //   ragEl = document.createElement("pre");
    //   ragEl.id = "rag-result";
    //   ragEl.className = "rag-result";
    //   textResult.parentNode.insertBefore(ragEl, textResult.nextSibling);
    // }

    // console.log("RAG content:", result.rag);

    // ragEl.textContent = (result.rag || "").replace(/\\n/g, "\n");

    xmlResult.textContent = result.xml;
    jsonResult.textContent = JSON.stringify(result.json, null, 2);

    // 画像の取得
    const img = new Image();
    img.onload = function () {
      // 結果の可視化
      // drawResults(resultCanvas, img, result.detections);
      drawResults(
        resultCanvas,
        img,
        result.clusteredResult || result.detections
      );
    };
    img.src = selectedImages[index].dataUrl;

    // ナビゲーションボタンの状態を更新
    updateNavigationButtons();
  }

  // 初期化ボタンのイベントリスナー
  processButton.addEventListener("click", async () => {
    try {
      if (selectedImages.length === 0) {
        alert("画像を選択してください");
        return;
      }

      document.getElementById("loading").style.display = "block";
      processButton.disabled = true;
      processedResults = [];
      currentImageIndex = 0;
      overallProgress = 0;

      // 初期化（実際のアプリケーションでは、起動時に一度だけ行う）
      if (!ocr.initialized) {
        await ocr.initialize(
          "models/rtmdet-s-1280x1280.onnx",
          {}, // レイアウト設定（空オブジェクト）
          "config/ndl.yaml", // レイアウト設定ファイルパス
          "models/parseq-ndl-32x384-tiny-10.onnx",
          {}, // 文字認識設定（空オブジェクト）
          "config/ndl.yaml", // 文字認識設定ファイルパス
          updateProgress
        );
      }

      // 各画像を順番に処理
      for (let i = 0; i < selectedImages.length; i++) {
        currentImageIndex = i;
        const imageInfo = selectedImages[i];

        // 画像の取得
        const img = new Image();
        await new Promise((resolve) => {
          img.onload = resolve;
          img.src = imageInfo.dataUrl;
        });

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // 処理実行
        const results = await ocr.process(imageData, {
          imageName: imageInfo.file.name || `image_${i + 1}`,
          imageDataURL: imageInfo.dataUrl,
        });

        // 結果を保存
        processedResults.push(results);
      }

      // 画像セレクタの設定
      imageSelector.innerHTML = "";
      selectedImages.forEach((image, index) => {
        const option = document.createElement("option");
        option.value = index;
        option.textContent = image.file.name || `Image ${index + 1}`;
        imageSelector.appendChild(option);
      });

      // 最初の結果を表示
      if (processedResults.length > 0) {
        currentResultIndex = 0;
        displayResult(0);

        // ナビゲーションボタンの有効化（複数画像がある場合）
        prevImageButton.disabled = true;
        nextImageButton.disabled = processedResults.length <= 1;
      }

      // 結果セクションの表示
      document.querySelector(".result-section").style.display = "block";

      // 複数画像がある場合は統合ダウンロードセクションを表示
      if (processedResults.length > 1) {
        document.querySelector(".download-section").style.display = "block";
      } else {
        document.querySelector(".download-section").style.display = "none";
      }
    } catch (error) {
      console.error("エラー:", error);
      alert(`処理中にエラーが発生しました: ${error.message}`);
    }
  });

  function drawResults(canvas, image, detections) {
    const ctx = canvas.getContext("2d");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    // 元画像の描画
    ctx.drawImage(image, 0, 0);

    // 定義一組顏色
    const colors = [
      "#FF0000", // 紅
      "#0072E3", // 深藍
      "#00CC66", // 綠
      "#FF9900", // 橙
      "#9900FF", // 紫
      "#FF00AA", // 粉
      "#00FF99", // 青
      "#FFD700", // 金黃
      "#8B0000", // 暗紅
      "#00CED1", // 深青
      "#228B22", // 深綠
      "#FF4500", // 橘紅
      "#483D8B", // 靛藍
      "#FF1493", // 深粉
      "#00BFFF", // 亮藍
      "#A0522D", // 棕色
      "#FFFF00", // 黃
      "#000000", // 黑
      "#FFA500", // 亮橙
      "#40E0D0", // 亮青
      "#C71585", // 紫紅
      "#7FFF00", // 亮綠
      "#B22222", // 深紅
    ];

    // cluster -1 用灰色
    const getColor = (cluster) => {
      if (cluster === -1) return "#888888";
      return colors[cluster % colors.length];
    };

    detections.forEach((detection, index) => {
      const { x, y, width, height, cluster, text } = detection;
      ctx.strokeStyle = getColor(cluster);
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, width, height);

      // 顯示 cluster 編號
      ctx.fillStyle = getColor(cluster);
      ctx.font = "14px Arial";
      ctx.fillText(`C${cluster}`, x + 5, y + 18);

      // 顯示文字
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillRect(x, y - 20, width, 20);
      ctx.fillStyle = "black";
      ctx.font = "12px Arial";
      ctx.fillText(index, x + 5, y - 5);
    });
  }

  // ファイルダウンロード用のヘルパー関数
  function downloadFile(content, fileName, contentType) {
    const a = document.createElement("a");
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ダウンロードボタンのイベントリスナー
  document
    .getElementById("download-text-button")
    .addEventListener("click", () => {
      if (processedResults.length === 0) return;

      // 画像名の配列を作成
      const imageNames = selectedImages.map(
        (image, index) => image.file.name || `image_${index + 1}`
      );

      // 統合テキストを生成
      const combinedText = ocr.outputGenerator.generateCombinedTXT(
        processedResults,
        imageNames
      );

      // ファイル名を生成（現在の日時を含める）
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .substring(0, 19);
      const fileName = `ndl_ocr_results_${timestamp}.txt`;

      // ダウンロード
      downloadFile(combinedText, fileName, "text/plain;charset=utf-8");
    });

  document
    .getElementById("download-xml-button")
    .addEventListener("click", () => {
      if (processedResults.length === 0) return;

      // 画像名の配列を作成
      const imageNames = selectedImages.map(
        (image, index) => image.file.name || `image_${index + 1}`
      );

      // 統合XMLを生成
      const combinedXML = ocr.outputGenerator.generateCombinedXML(
        processedResults,
        imageNames
      );

      // ファイル名を生成（現在の日時を含める）
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .substring(0, 19);
      const fileName = `ndl_ocr_results_${timestamp}.xml`;

      // ダウンロード
      downloadFile(combinedXML, fileName, "application/xml;charset=utf-8");
    });

  document
    .getElementById("download-json-button")
    .addEventListener("click", () => {
      if (processedResults.length === 0) return;

      // 画像名の配列を作成
      const imageNames = selectedImages.map(
        (image, index) => image.file.name || `image_${index + 1}`
      );

      // 統合JSONを生成
      const combinedJSON = ocr.outputGenerator.generateCombinedJSON(
        processedResults,
        imageNames
      );

      // JSONを文字列に変換（整形して読みやすく）
      const jsonString = JSON.stringify(combinedJSON, null, 2);

      // ファイル名を生成（現在の日時を含める）
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .substring(0, 19);
      const fileName = `ndl_ocr_results_${timestamp}.json`;

      // ダウンロード
      downloadFile(jsonString, fileName, "application/json;charset=utf-8");
    });

  // コピーボタンの機能を追加
  const copyButtons = document.querySelectorAll(".copy-button");

  // 各ボタンにイベントリスナーを追加
  copyButtons.forEach((button) => {
    button.addEventListener("click", () => {
      // コピー対象の要素IDを取得
      const targetId = button.getAttribute("data-target");
      const targetElement = document.getElementById(targetId);

      // テキストをコピー
      const text = targetElement.textContent;
      navigator.clipboard
        .writeText(text)
        .then(() => {
          // コピー成功時のフィードバック表示
          const feedback = button.nextElementSibling;
          feedback.classList.add("show");

          // 2秒後にフィードバックを非表示
          setTimeout(() => {
            feedback.classList.remove("show");
          }, 2000);
        })
        .catch((err) => {
          console.error("コピーに失敗しました:", err);
          alert("コピーに失敗しました。");
        });
    });
  });
});
