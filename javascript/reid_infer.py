import os
import sys
import json
import shutil
import numpy as np
import warnings
import torch
from torchvision import transforms

import models
from util.utils import read_image, img_to_tensor
from util.FeatureExtractor import FeatureExtractor

warnings.filterwarnings("ignore")

os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'


def l2_normalize(array):
    norms = np.linalg.norm(array, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return array / norms


def euclidean_distance(vector_a, vector_b):
    return float(np.linalg.norm(vector_a - vector_b))


def run_find_most(query_path, crops_dir, output_dir, top_k=1, exclude_filename=''):
    os.environ['CUDA_VISIBLE_DEVICES'] = "1"
    use_gpu = torch.cuda.is_available()

    # 初始化模型
    model = models.init_model(
        name='resnet50',
        num_classes=751,
        loss={'softmax', 'metric'},
        use_gpu=use_gpu,
        aligned=True
    )
    checkpoint = torch.load(
        "./log/market1501/alignedreid/checkpoint_ep300.pth.tar",
        map_location="cpu",
        weights_only=False
    )
    model.load_state_dict(checkpoint['state_dict'])

    transform = transforms.Compose([
        transforms.Resize((256, 128)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406],
                             std=[0.229, 0.224, 0.225]),
    ])

    exact_list = ['7']
    extractor = FeatureExtractor(model, exact_list)

    def pool2d(tensor, type='max'):
        sz = tensor.size()
        kernel_size = (int(sz[2] // 8), int(sz[3]))
        x = torch.nn.functional.max_pool2d(tensor, kernel_size=kernel_size) \
            if type == 'max' else torch.nn.functional.avg_pool2d(tensor, kernel_size=kernel_size)
        x = x[0].cpu().data.numpy()
        x = np.transpose(x, (2, 1, 0))[0]
        return x

    img1 = read_image(query_path)
    img1_tensor = img_to_tensor(img1, transform)
    if use_gpu:
        model = model.cuda()
        img1_tensor = img1_tensor.cuda()
    model.eval()

    f1 = extractor(img1_tensor)
    a1 = l2_normalize(pool2d(f1[0], type='max'))

    os.makedirs(output_dir, exist_ok=True)
    all_matches = []

    for img_name in os.listdir(crops_dir):
        img_path = os.path.join(crops_dir, img_name)
        if img_path == query_path:
            continue
        if exclude_filename and os.path.basename(img_path) == exclude_filename:
            continue
        try:
            img2 = read_image(img_path)
            img2_tensor = img_to_tensor(img2, transform)
            if use_gpu:
                img2_tensor = img2_tensor.cuda()
            f2 = extractor(img2_tensor)
            a2 = l2_normalize(pool2d(f2[0], type='max'))

            dist = np.zeros((8, 8))
            for i in range(8):
                for j in range(8):
                    dist[i][j] = euclidean_distance(a1[i], a2[j])
            aligned_distance = np.mean(dist)

            all_matches.append({
                "filename": os.path.basename(img_path),
                "distance": float(aligned_distance),
                "similarity": float(1 / (1 + aligned_distance)),
                "original_path": os.path.abspath(img_path)
            })
        except Exception as e:
            print(f"⚠️ 跳过 {img_name}: {e}")

    all_matches = sorted(all_matches, key=lambda item: item["distance"])
    top_matches = all_matches[:max(1, int(top_k or 1))]

    for item in top_matches:
        output_path = os.path.join(output_dir, item["filename"])
        shutil.copy2(item["original_path"], output_path)
        item["output_path"] = os.path.abspath(output_path)

    if top_matches:
        best_match = top_matches[0]
        result = {
            "filename": best_match["filename"],
            "distance": best_match["distance"],
            "similarity": best_match["similarity"],
            "original_path": best_match["original_path"],
            "output_path": best_match["output_path"],
            "results": top_matches
        }
    else:
        result = {
            "filename": "",
            "distance": None,
            "similarity": None,
            "results": []
        }

    print(json.dumps(result, ensure_ascii=False))
    sys.stdout.flush()



if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python reid_infer.py <query_path> <crops_dir> <output_dir> [top_k]")
        sys.exit(1)
    run_find_most(
        sys.argv[1],
        sys.argv[2],
        sys.argv[3],
        int(sys.argv[4]) if len(sys.argv) >= 5 else 1,
        sys.argv[5] if len(sys.argv) >= 6 else ''
    )
