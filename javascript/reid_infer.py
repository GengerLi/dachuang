import os
import sys
import json
import shutilaswww
import numpy as np
import warnings
import torch
from torchvision import transforms
from sklearn.preprocessing import normalize
from scipy.spatial.distance import euclidean

import models
from util.utils import read_image, img_to_tensor
from util.FeatureExtractor import FeatureExtractor

warnings.filterwarnings("ignore")

os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'


def run_find_most(query_path, crops_dir, output_dir):
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
    a1 = normalize(pool2d(f1[0], type='max'))

    os.makedirs(output_dir, exist_ok=True)
    best_match = None
    best_distance = float('inf')

    for img_name in os.listdir(crops_dir):
        img_path = os.path.join(crops_dir, img_name)
        if img_path == query_path:
            continue
        try:
            img2 = read_image(img_path)
            img2_tensor = img_to_tensor(img2, transform)
            if use_gpu:
                img2_tensor = img2_tensor.cuda()
            f2 = extractor(img2_tensor)
            a2 = normalize(pool2d(f2[0], type='max'))

            dist = np.zeros((8, 8))
            for i in range(8):
                for j in range(8):
                    dist[i][j] = euclidean(a1[i], a2[j])
            aligned_distance = np.mean(dist)

            if aligned_distance < best_distance:
                best_distance = aligned_distance
                best_match = img_path
        except Exception as e:
            print(f"⚠️ 跳过 {img_name}: {e}")

    if best_match:
        output_path = os.path.join(output_dir, os.path.basename(best_match))
        shutil.copy2(best_match, output_path)
        
        if best_match:
            similarity = 1 / (1 + best_distance)
            result = {
                "filename": os.path.basename(best_match),
                "distance": float(best_distance),
                "similarity": float(similarity),
                "original_path": os.path.abspath(best_match),
                "output_path": os.path.abspath(output_path)
            }
        else:
            result = None

        print(json.dumps(result, ensure_ascii=False))
        sys.stdout.flush()  



if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python reid_infer.py <query_path> <crops_dir> <output_dir>")
        sys.exit(1)
    run_find_most(sys.argv[1], sys.argv[2], sys.argv[3])
